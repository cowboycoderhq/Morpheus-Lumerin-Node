import os from 'node:os'
import { OrchestratorConfig } from './src/main/orchestrator/orchestrator.types'
import {
  buildLocalModelsConfig,
  buildLocalRatingConfig
} from './src/main/orchestrator/proxy-config'

const configMacArm = {
  proxyRouter: {
    downloadUrl: process.env.SERVICE_PROXY_DOWNLOAD_URL_MAC_ARM64,
    fileName: './services/proxy-router/proxy-router' as string,
    runPath: './services/proxy-router/proxy-router' as string,
    ports: [process.env.SERVICE_PROXY_PORT, process.env.SERVICE_PROXY_API_PORT],
    env: {
      DIAMOND_CONTRACT_ADDRESS: process.env.DIAMOND_ADDRESS,
      MOR_TOKEN_ADDRESS: process.env.TOKEN_ADDRESS,
      BLOCKSCOUT_API_URL: process.env.BLOCKSCOUT_API_URL,
      ETH_NODE_CHAIN_ID: String(process.env.CHAIN_ID),
      ENVIRONMENT: process.env.NODE_ENV,
      AUTH_CONFIG_FILE_PATH: './proxy.conf',
      COOKIE_FILE_PATH: './.cookie',
      PROXY_ADDRESS: `0.0.0.0:${process.env.SERVICE_PROXY_PORT}`,
      WEB_ADDRESS: `0.0.0.0:${process.env.SERVICE_PROXY_API_PORT}`,
      WEB_PUBLIC_URL: `http://localhost:${process.env.SERVICE_PROXY_API_PORT}`,
      MODELS_CONFIG_PATH: './models-config.json',
      RATING_CONFIG_PATH: './rating-config.json',
      ETH_NODE_USE_SUBSCRIPTIONS: 'false',
      ETH_NODE_ADDRESS: '',
      PROXY_STORE_CHAT_CONTEXT: 'true',
      // The CLIENT owns the conversation context (Chat.tsx sends the full
      // transcript). Leave the router's own prepend OFF so the two can never
      // double up — today it prepends nothing anyway (its AppendChatHistory
      // type-assertion fails after a JSON round-trip), but when that upstream bug
      // is fixed, a router that also prepends would duplicate every turn.
      // Storing stays ON: the history drawer reads it back via /v1/chats/:id.
      PROXY_FORWARD_CHAT_CONTEXT: 'false',
      PROXY_STORAGE_PATH: './data/',
      LOG_COLOR: 'false',
      LOG_FOLDER_PATH: './logs/',
      IPFS_MULTADDR: `/ip4/127.0.0.1/tcp/${process.env.SERVICE_IPFS_API_PORT}`,
      DOCKER_HOST: 'unix:///var/run/docker.sock' as string
    },
    modelsConfig: JSON.stringify(
      buildLocalModelsConfig(
        'qwen2.5-1.5b-instruct',
        'openai',
        `http://localhost:${process.env.SERVICE_AI_API_PORT}/v1/chat/completions`
      )
    ),
    ratingConfig: JSON.stringify(buildLocalRatingConfig()),
    probe: {
      url: `http://localhost:${process.env.SERVICE_PROXY_API_PORT}/healthcheck`,
      // First boot dials the chain and provisions a wallet; 10s is not enough on
      // a cold machine or a slow link.
      timeout: 120000
    }
  },
  aiRuntime: {
    //original b4406
    downloadUrl:
      'https://github.com/ggml-org/llama.cpp/releases/download/b5002/llama-b5002-bin-macos-arm64.zip' as string,
    fileName: './services/llama.zip' as string,
    extractPath: './services/ai-runtime',
    runPath: './services/ai-runtime/build/bin/llama-server' as string,
    ports: [process.env.SERVICE_AI_API_PORT],
    runArgs: [
      '--no-webui',
      '--model',
      '../../../qwen2.5-1.5b-instruct-q4_k_m.gguf',
      '--port',
      `${process.env.SERVICE_AI_API_PORT}`,
      '--log-file',
      './llama.log'
    ] as string[],
    probe: {
      url: `http://127.0.0.1:${process.env.SERVICE_AI_API_PORT}/health`,
      // llama-server's FIRST start has to load a ~1.07 GB model AND compile Metal
      // shaders from cold. That takes far longer than the 10s DEFAULT_TIMEOUT the
      // probe was silently inheriting — and on timeout ManagedProcess.ping() does
      // `await this.stop()`, KILLING the server mid-load. Every retry respawned it
      // and killed it at 10s again, so the AI step failed identically forever and
      // "Try again" could never work. A fast, warm machine slips under 10s; a
      // fresh one does not.
      timeout: 300000
    }
  },
  aiModel: {
    // TinyLlama-1.1B at Q2_K (2-bit) was incoherent: asked "hello" it ignored
    // the turn and free-associated web text. The chat template was applied
    // correctly and no system prompt was at fault — the quant simply had no
    // instruction-following left. Qwen2.5-1.5B-Instruct at Q4_K_M answers
    // "hello" correctly with no system prompt at all, and is Apache-2.0
    // (no redistribution strings, unlike the Llama licence).
    //
    // NOTE: the downloader skips on filename existence, so this filename MUST
    // change whenever the model does — otherwise everyone who already ran the
    // app keeps the old broken .gguf forever.
    downloadUrl:
      'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf' as string,
    fileName: './services/qwen2.5-1.5b-instruct-q4_k_m.gguf' as string
  },
  ipfs: {
    downloadUrl:
      'https://github.com/ipfs/kubo/releases/download/v0.34.1/kubo_v0.34.1_darwin-arm64.tar.gz' as string,
    fileName: './services/ipfs.tar.gz' as string,
    extractPath: './services/ipfs',
    runPath: './services/ipfs/kubo/ipfs' as string,
    ports: [process.env.SERVICE_IPFS_API_PORT],
    runArgs: [
      'daemon',
      '--init',
      `--api=/ip4/127.0.0.1/tcp/${process.env.SERVICE_IPFS_API_PORT}`,
      `--repo-dir=../data`
    ],
    probe: {
      url: `http://127.0.0.1:${process.env.SERVICE_IPFS_API_PORT}/api/v0/version`,
      method: 'POST',
      timeout: 20000
    }
  },
  containerRuntime: {
    downloadUrl: 'https://desktop.docker.com/mac/main/arm64/Docker.dmg' as string,
    probe: {
      url: 'unix:///var/run/docker.sock:/version' as string
    }
  }
} as const satisfies OrchestratorConfig

const configMacX64 = {
  proxyRouter: {
    ...configMacArm.proxyRouter,
    downloadUrl: process.env.SERVICE_PROXY_DOWNLOAD_URL_MAC_X64
  },
  aiRuntime: {
    ...configMacArm.aiRuntime,
    downloadUrl:
      'https://github.com/ggml-org/llama.cpp/releases/download/b4406/llama-b4406-bin-macos-x64.zip'
  },
  aiModel: {
    ...configMacArm.aiModel
  },
  ipfs: {
    ...configMacArm.ipfs,
    downloadUrl:
      'https://github.com/ipfs/kubo/releases/download/v0.34.1/kubo_v0.34.1_darwin-amd64.tar.gz'
  },
  containerRuntime: {
    ...configMacArm.containerRuntime,
    downloadUrl: 'https://desktop.docker.com/mac/main/amd64/Docker.dmg' as string
  }
} as const satisfies OrchestratorConfig

const configLinux: typeof configMacArm = {
  proxyRouter: {
    ...configMacArm.proxyRouter,
    downloadUrl: process.env.SERVICE_PROXY_DOWNLOAD_URL_LINUX_X64
  },
  // original b4406
  aiRuntime: {
    ...configMacArm.aiRuntime,
    downloadUrl:
      'https://github.com/ggml-org/llama.cpp/releases/download/b5002/llama-b5002-bin-ubuntu-x64.zip'
  },
  aiModel: {
    ...configMacArm.aiModel
  },
  ipfs: {
    ...configMacArm.ipfs,
    downloadUrl:
      'https://github.com/ipfs/kubo/releases/download/v0.34.1/kubo_v0.34.1_linux-amd64.tar.gz'
  },
  containerRuntime: {
    ...configMacArm.containerRuntime,
    downloadUrl: 'https://desktop.docker.com/linux/main/amd64/docker-desktop-amd64.deb' as string
  }
}

const configLinuxArm: typeof configMacArm = {
  proxyRouter: {
    ...configMacArm.proxyRouter,
    downloadUrl: process.env.SERVICE_PROXY_DOWNLOAD_URL_LINUX_ARM64
  },
  aiRuntime: {
    ...configMacArm.aiRuntime,
    downloadUrl:
      'https://github.com/ggml-org/llama.cpp/releases/download/b5002/llama-b5002-bin-ubuntu-arm64.zip'
  },
  aiModel: {
    ...configMacArm.aiModel
  },
  ipfs: {
    ...configMacArm.ipfs,
    downloadUrl:
      'https://github.com/ipfs/kubo/releases/download/v0.34.1/kubo_v0.34.1_linux-arm64.tar.gz'
  },
  containerRuntime: {
    ...configMacArm.containerRuntime,
    downloadUrl: 'https://docs.docker.com/desktop/setup/install/linux/' as string
  }
}

const configWin: typeof configMacArm = {
  proxyRouter: {
    ...configMacArm.proxyRouter,
    downloadUrl: process.env.SERVICE_PROXY_DOWNLOAD_URL_WINDOWS_X64,
    fileName: './services/proxy-router.exe' as string,
    runPath: './services/proxy-router.exe' as string,
    env: {
      ...configMacArm.proxyRouter.env,
      DOCKER_HOST: 'npipe:////./pipe/docker_engine'
    }
  },
  aiRuntime: {
    ...configMacArm.aiRuntime,
    downloadUrl:
      'https://github.com/ggml-org/llama.cpp/releases/download/b5002/llama-b5002-bin-win-avx2-x64.zip',
    runPath: './services/ai-runtime/llama-server.exe' as string,
    runArgs: [
      '--no-webui',
      '--model',
      '../qwen2.5-1.5b-instruct-q4_k_m.gguf',
      '--port',
      `${process.env.SERVICE_AI_API_PORT}`
    ]
  },
  aiModel: {
    ...configMacArm.aiModel
  },
  ipfs: {
    ...configMacArm.ipfs,
    downloadUrl:
      'https://github.com/ipfs/kubo/releases/download/v0.34.1/kubo_v0.34.1_windows-amd64.zip',
    fileName: './services/ipfs.zip',
    runPath: './services/ipfs/kubo/ipfs.exe'
  },
  containerRuntime: {
    probe: {
      url: 'npipe:////./pipe/docker_engine:/version'
    },
    downloadUrl:
      'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe' as string
  }
}
// *********************************************************************************
// WARNING: LLAMA.CPP DOES NOT SUPPORT ARM64 for GGUF (found one for win-llvm-arm64 so need to change model as well...no idea if it works)
// *********************************************************************************
const configWinArm: typeof configMacArm = {
  proxyRouter: {
    ...configWin.proxyRouter,
    downloadUrl: process.env.SERVICE_PROXY_DOWNLOAD_URL_WINDOWS_ARM64,
    fileName: './services/proxy-router.exe' as string,
    runPath: './services/proxy-router.exe' as string
  },
  aiRuntime: {
    ...configMacArm.aiRuntime,
    downloadUrl:
      'https://github.com/ggml-org/llama.cpp/releases/download/b5002/llama-b5002-bin-win-llvm-arm64.zip',
    runPath: './services/ai-runtime/llama-server.exe' as string,
    runArgs: [
      '--no-webui',
      '--model',
      '../qwen2.5-1.5b-instruct-q4_k_m.gguf',
      '--port',
      `${process.env.SERVICE_AI_API_PORT}`
    ]
  },
  // Was pointing at a `.llvm` model file that does not exist on HuggingFace —
  // a guaranteed 404 on every Windows-ARM launch. There is no such format: a
  // GGUF is a GGUF regardless of the CPU the runtime was built for, so this
  // takes the same model as every other platform.
  aiModel: {
    ...configMacArm.aiModel
  },
  ipfs: {
    ...configMacArm.ipfs,
    downloadUrl:
      'https://github.com/ipfs/kubo/releases/download/v0.34.1/kubo_v0.34.1_windows-arm64.zip',
    fileName: './services/ipfs.zip',
    runPath: './services/ipfs/kubo/ipfs.exe'
  },
  containerRuntime: {
    ...configWin.containerRuntime,
    downloadUrl:
      'https://desktop.docker.com/win/main/arm64/Docker%20Desktop%20Installer.exe' as string
  }
}

const cfg = {
  darwin: {
    x64: configMacX64,
    arm64: configMacArm
  },
  linux: {
    x64: configLinux,
    arm64: configLinuxArm
  },
  win32: {
    x64: configWin,
    arm64: configWinArm
  }
}[os.platform()]?.[os.arch()]

if (!cfg) {
  throw new Error(`Unsupported platform: ${os.platform()} ${os.arch()}`)
}

export { cfg }
