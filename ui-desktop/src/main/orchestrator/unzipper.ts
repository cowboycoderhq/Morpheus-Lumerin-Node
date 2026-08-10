import yauzl from 'yauzl'
import fs from 'fs-extra'
import path from 'node:path'
import os from 'node:os'
import { Transform } from 'node:stream'
import throttle from 'lodash/throttle'
import zlib from 'node:zlib'
import tar from 'tar-stream'

interface ExtractProgress {
  progress: number
  status: 'extracting' | 'complete' | 'error'
  error?: string
}

// Number of parallel extractions (tune for your system).
const MAX_CONCURRENT_EXTRACTS = os.cpus().length * 2
const OnProgressUpdateRateMs = 300

// A zip stores each entry's unix mode in the high 16 bits of
// externalFileAttributes. We were dropping it and letting createWriteStream use
// its default (0o666 & ~umask -> 0644), so EVERY extracted file came out
// non-executable — including `llama-server` itself, which the archive marks
// 0755. The result on a fresh machine: `permission denied` on the AI runtime,
// forever. Nothing about this is arch- or machine-specific; it only stayed
// hidden because a machine that ever extracted a working copy keeps it.
//
// Returns undefined for zips written by tools that store no unix mode (DOS
// attributes only) — in that case the platform default is the right answer.
// Mask 0o777, not 0o7777: we deliberately drop setuid/setgid/sticky. The
// downloader validates the archive only by content-length, so an attacker-
// supplied zip should not be able to ask us to create a setuid file.
const unixModeOf = (entry: yauzl.Entry): number | undefined => {
  const mode = (entry.externalFileAttributes >>> 16) & 0o777
  return mode === 0 ? undefined : mode
}

const getTempPath = (p: string) => {
  // append .temp to the path folder name
  const dir = path.dirname(p)
  const base = path.basename(p)
  return path.join(dir, `${base}.temp`)
}

export async function extractFile(
  source: string,
  destination: string,
  onProgress?: (progress: ExtractProgress) => void
): Promise<void> {
  // check if the file is a zip or a tar.gz
  const ext = path.extname(source)
  if (ext === '.zip') {
    return extractZip(source, destination, onProgress)
  } else if (ext === '.gz') {
    return extractTarGz(source, destination, onProgress)
  }
  throw new Error(`Unsupported file extension: ${ext}`)
}

/**
 * Extracts a ZIP archive with optimal memory handling and parallelism.
 * @param {string} zipPath - Path to the ZIP file.
 * @param {string} outputDir - Destination folder for extraction.
 */
export async function extractZip(
  zipPath: string,
  outputDir: string,
  onProgress?: (progress: ExtractProgress) => void
): Promise<void> {
  const throttledOnProgress = onProgress
    ? throttle((progress: ExtractProgress) => onProgress(progress), OnProgressUpdateRateMs)
    : undefined

  if (fs.existsSync(outputDir)) {
    throttledOnProgress?.({
      progress: 0,
      status: 'complete'
    })
    throttledOnProgress?.flush()
    return Promise.resolve()
  }

  const outputDirTemp = getTempPath(outputDir)
  // A .temp tree left behind by an interrupted run would otherwise survive into
  // the final tree — stale files from an older build, silently mixed in.
  fs.removeSync(outputDirTemp)

  return new Promise((resolve, reject) => {
    let totalEntries = 0
    const entryQueue: yauzl.Entry[] = []

    const onError = (err: Error) => {
      const processedEntries = totalEntries - entryQueue.length
      throttledOnProgress?.({
        progress: processedEntries / totalEntries,
        status: 'error',
        error: err.message
      })
      throttledOnProgress?.flush()
      return reject(err)
    }

    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err) {
        onError(err)
      }

      let activeExtracts = 0
      let done = false

      const processNextEntry = async () => {
        try {
          while (activeExtracts < MAX_CONCURRENT_EXTRACTS && entryQueue.length > 0) {
            const entry = entryQueue.shift()!
            await extractEntry(entry)
          }

          if (done && activeExtracts === 0 && entryQueue.length === 0) {
            await fs.move(outputDirTemp, outputDir, { overwrite: true })
            await fs.remove(zipPath)
            throttledOnProgress?.({ progress: 1, status: 'complete' })
            throttledOnProgress?.flush()
            resolve()
          }
        } catch (err) {
          return onError(err as Error)
        }
      }

      const extractEntry = (entry: yauzl.Entry): Promise<void> => {
        const outputPath = path.join(outputDirTemp, entry.fileName)

        if (entry.fileName.endsWith('/')) {
          return fs
            .ensureDir(outputPath)
            .then(() => {
              zipfile.readEntry()
              processNextEntry()
            })
            .catch(onError)
        }

        activeExtracts++

        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) {
            return onError(err)
          }

          fs.ensureDir(path.dirname(outputPath))
            .then(() => {
              const writeStream = fs.createWriteStream(outputPath)
              const speedLimiter = new Transform({
                transform(chunk, _, callback) {
                  callback(null, chunk)
                }
              })

              readStream.pipe(speedLimiter).pipe(writeStream)

              writeStream.on('finish', () => {
                // Restore the mode the ARCHIVE recorded (0755 for llama-server),
                // before anything tries to execute it.
                const mode = unixModeOf(entry)
                const applyMode = mode
                  ? fs.chmod(outputPath, mode).catch(() => {
                      // Non-fatal: ManagedProcess still chmods its own binary
                      // before spawn. Losing the bit on a sibling file is not
                      // worth failing an install over.
                    })
                  : Promise.resolve()

                applyMode
                  .then(() => {
                    activeExtracts--
                    const processedEntries = totalEntries - entryQueue.length
                    throttledOnProgress?.({
                      progress: processedEntries / totalEntries,
                      status: 'extracting'
                    })
                    zipfile.readEntry()
                    processNextEntry()
                  })
                  // Without this, a throw inside the callback (onProgress ->
                  // emitStateUpdate -> IPC to a destroyed window is a real one)
                  // leaves readEntry()/processNextEntry() uncalled and the outer
                  // promise PENDING FOREVER — a silent hang inside the extractor.
                  // Before this chain existed the same throw crashed loudly.
                  // Turning a loud crash into a silent hang is strictly worse.
                  .catch(onError)
              })

              writeStream.on('error', onError)
              readStream.on('error', onError)
            })
            .catch(onError)
        })
        return Promise.resolve()
      }

      zipfile.on('entry', (entry) => {
        entryQueue.push(entry)
        totalEntries++
        processNextEntry()
      })

      zipfile.on('end', () => {
        done = true
        processNextEntry()
      })

      zipfile.on('error', onError)

      zipfile.readEntry() // Start processing entries.
    })
  })
}

// Function to extract .tar.gz
export async function extractTarGz(
  source: string,
  destination: string,
  onProgress?: (progress: ExtractProgress) => void
): Promise<void> {
  const throttledOnProgress = onProgress
    ? throttle((progress: ExtractProgress) => onProgress(progress), OnProgressUpdateRateMs)
    : undefined

  if (fs.existsSync(destination)) {
    throttledOnProgress?.({
      progress: 0,
      status: 'complete'
    })
    throttledOnProgress?.flush()
    return Promise.resolve()
  }

  const tempDestination = getTempPath(destination)
  fs.removeSync(tempDestination) // see extractZip: never inherit a stale .temp tree

  // Get total file size for progress tracking
  const stats = await fs.stat(source)
  const totalSize = stats.size
  let processedSize = 0

  return new Promise((resolve, reject) => {
    const extract = tar.extract()
    const input = fs.createReadStream(source)
    const unzip = zlib.createGunzip()

    const onError = (err: Error) => {
      throttledOnProgress?.({
        progress: processedSize / totalSize,
        status: 'error',
        error: err.message
      })
      throttledOnProgress?.flush()
      reject(err)
    }

    input.on('error', onError)
    unzip.on('error', onError)
    extract.on('error', onError)

    // Track progress through the gunzip stream
    unzip.on('data', (chunk) => {
      processedSize += chunk.length
      throttledOnProgress?.({
        progress: processedSize / totalSize,
        status: 'extracting'
      })
    })

    input.pipe(unzip).pipe(extract)

    extract.on('entry', (header, stream, next) => {
      const outputPath = path.join(tempDestination, header.name)

      // Confine to the destination. The zip path gets this for free (yauzl
      // rejects '../' entries); the tar path did not, so an entry named
      // `../../evil` would be written OUTSIDE the destination — a worse
      // primitive than the setuid case the zip path already guards against.
      const root = path.resolve(tempDestination)
      if (outputPath !== root && !path.resolve(outputPath).startsWith(root + path.sep)) {
        stream.resume()
        return onError(new Error(`Blocked path traversal in archive entry: ${header.name}`))
      }

      if (header.type === 'directory') {
        try {
          fs.mkdirSync(outputPath, { recursive: true })
          stream.resume()
          next()
        } catch (err) {
          onError(err as Error)
        }
      } else {
        // Ensure directories exist
        try {
          fs.mkdirSync(path.dirname(outputPath), { recursive: true })
          // Same bug as the zip path: tar records the mode, we ignored it — so
          // the IPFS binary also came out non-executable.
          //
          // chmod on 'finish', NOT createWriteStream({mode}): the stream's mode
          // is applied only at CREATION and is masked by the process umask, so
          // it silently fails to give you 0755 on an existing file or under a
          // restrictive umask. chmod is unconditional.
          const output = fs.createWriteStream(outputPath)

          stream.pipe(output)

          output.on('finish', () => {
            const mode = header.mode ? header.mode & 0o777 : undefined
            if (!mode) return next()
            fs.chmod(outputPath, mode)
              .then(() => next())
              .catch(onError)
          })
          output.on('error', onError)
        } catch (err) {
          onError(err as Error)
        }
      }
    })

    extract.on('finish', async () => {
      try {
        await fs.move(tempDestination, destination, { overwrite: true })
        await fs.remove(source)
        throttledOnProgress?.({
          progress: 1,
          status: 'complete'
        }) // Signal 100% completion
        throttledOnProgress?.flush()
        resolve()
      } catch (err) {
        onError(err as Error)
      }
    })
  })
}
