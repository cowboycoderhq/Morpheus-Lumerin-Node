import {
  IconPencil,
  IconTrash,
  IconSearch,
  IconCheck,
  IconX,
  IconMessage,
} from '@tabler/icons-react';
import { abbreviateAddress } from '../../utils';
import { isClosed } from './utils';
import { earlyCloseLock, weiToMor } from '../../utils/marketplace';
import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Badge from 'react-bootstrap/Badge';
import * as components from './ChatHistory.styles';
import { useEffect, useState } from 'react';
import { useTheme } from 'styled-components';
import { ChatData } from './interfaces';

interface ChatHistoryProps {
  open: boolean;
  onCloseSession: (id: string) => void;
  onSelectChat: (chat: ChatData) => void;
  refreshSessions: () => Promise<void>;
  deleteHistory: (chatId: string) => void;
  onChangeTitle: (data: { id: string; title: string }) => Promise<void>;
  sessions: any[];
  models: any[];
  activeChat: any;
  chatData: ChatData[];
}

const HistoryEntry = ({
  entry,
  deleteHistory,
  onSelectChat,
  isActive,
  onChangeTitle,
}: {
  entry: ChatData;
  deleteHistory: (id: string) => void;
  onSelectChat: (entry: ChatData) => void;
  isActive: boolean;
  onChangeTitle: (data: { id: string; title: string }) => Promise<void>;
}) => {
  const theme = useTheme();
  const [isEdit, setIsEdit] = useState<boolean>(false);
  const [title, setTitle] = useState<string>(entry?.title || '');

  // Keep the editable buffer in sync if the upstream title changes
  // (e.g. an external rename) while we're not actively editing.
  useEffect(() => {
    if (!isEdit) setTitle(entry?.title || '');
  }, [entry?.title, isEdit]);

  const wrapDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteHistory(id);
  };

  const commitTitle = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    setIsEdit(false);
    await onChangeTitle({ id: chatId, title });
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTitle(entry?.title || '');
    setIsEdit(false);
  };

  if (isEdit) {
    return (
      <components.HistoryEntryTitle
        data-active={isActive ? 'true' : undefined}
        // Don't select when editing — clicks here belong to the form.
        onClick={(e) => e.stopPropagation()}
      >
        <components.ChangeTitleContainer>
          <InputGroup
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'transparent' }}
          >
            <Form.Control
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void commitTitle(e as unknown as React.MouseEvent, entry.id);
                } else if (e.key === 'Escape') {
                  cancelEdit(e as unknown as React.MouseEvent);
                }
              }}
              // react-bootstrap's Form.Control takes a style object, not a
              // styled template, so the token is read through useTheme() here.
              // It was a frozen 95%-white literal — the rename input kept
              // aurora's text colour under classic.
              style={{
                background: 'transparent',
                color: theme.colors.textPrimary,
                border: 'none',
                boxShadow: 'none',
                outline: 'none',
              }}
            />
          </InputGroup>
          <components.IconsContainer>
            <components.IconButton
              type="button"
              aria-label="Save title"
              onClick={(e) => commitTitle(e, entry.id)}
            >
              <IconCheck size={18} />
            </components.IconButton>
            <components.IconButton
              type="button"
              aria-label="Cancel"
              onClick={cancelEdit}
            >
              <IconX size={18} />
            </components.IconButton>
          </components.IconsContainer>
        </components.ChangeTitleContainer>
      </components.HistoryEntryTitle>
    );
  }

  return (
    <components.HistoryEntryTitle
      data-active={isActive ? 'true' : undefined}
      onClick={() => onSelectChat(entry)}
      title={title /* native tooltip surfaces full title when truncated */}
    >
      <span className="title">{title || 'Untitled chat'}</span>
      <span className="icons" onClick={(e) => e.stopPropagation()}>
        <components.IconButton
          type="button"
          aria-label="Rename chat"
          onClick={(e) => {
            e.stopPropagation();
            setIsEdit(true);
          }}
        >
          <IconPencil size={18} />
        </components.IconButton>
        <components.IconButton
          type="button"
          aria-label="Delete chat"
          className="danger"
          onClick={(e) => wrapDelete(e, entry.id)}
        >
          <IconTrash size={18} />
        </components.IconButton>
      </span>
    </components.HistoryEntryTitle>
  );
};

// Closing does not spend the stake — it time-locks the part of the session that
// falls inside the UTC day of the close, until the end of that day. Running to
// the end does NOT avoid that (measured against the deployed Diamond,
// 2026-08-06); it locks more, because more of the session has been used. The
// user cannot know any of this from the button, so state it with the real
// figure. A live session lost ~2.7 MOR to this silence on 2026-07-16.
const CloseSessionConfirm = ({
  session,
  onCancel,
  onConfirm,
}: {
  session: any;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const lock = earlyCloseLock(session, Math.floor(Date.now() / 1000));
  const when = (unix: number) =>
    new Date(unix * 1000).toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });

  return (
    <components.ConfirmPanel data-testid="close-session-confirm">
      {/* The condition is "does this close lock anything", NOT "is it early".
          It used to be lock.isEarly, paired with a hint telling the user to
          wait for the end time and avoid the lock. On the deployed contract
          that advice is backwards: waiting locks MORE, because the lock is on
          the time you USED. There is no timing that avoids it. */}
      {lock.known && lock.lockedWei > 0n ? (
        <>
          <components.ConfirmText>
            Closing now locks{' '}
            <components.ConfirmLockAmount>
              {weiToMor(lock.lockedWei, 4)} MOR
            </components.ConfirmLockAmount>{' '}
            until {when(lock.unlockAt)}, when it returns automatically. You get{' '}
            {weiToMor(lock.returnedWei, 4)} MOR back right away — nothing is
            lost, but the locked part is unreachable until then.
          </components.ConfirmText>
          <components.ConfirmHint>
            {lock.isEarly
              ? `Letting it run to ${when(lock.endsAt)} does not avoid this — the lock covers the time you use, so a full session locks the full stake. Closing early is what frees the unused part now.`
              : 'This session has already reached its end time, so the whole stake counts as used.'}
          </components.ConfirmHint>
        </>
      ) : (
        // Nothing to lock (a session that never billed), or unpriceable.
        // Never invent a figure on a money surface.
        <components.ConfirmText>
          {lock.known
            ? 'Closing this session locks nothing — your full stake is returned.'
            : 'Close this session? Its stake could not be priced, so the amount held back cannot be shown here.'}
        </components.ConfirmText>
      )}
      <components.ConfirmActions>
        <components.CloseBtn
          data-testid="close-session-confirm-btn"
          onClick={onConfirm}
        >
          {lock.known && lock.lockedWei > 0n ? 'Close & lock' : 'Close session'}
        </components.CloseBtn>
        <components.CancelBtn
          data-testid="close-session-cancel-btn"
          onClick={onCancel}
        >
          {lock.known && lock.lockedWei > 0n ? 'Keep it open' : 'Cancel'}
        </components.CancelBtn>
      </components.ConfirmActions>
    </components.ConfirmPanel>
  );
};

export const ChatHistory = (props: ChatHistoryProps) => {
  const sessions = props.sessions;
  const [search, setSearch] = useState<string>('');
  const [confirmingClose, setConfirmingClose] = useState<string | null>(null);

  useEffect(() => {
    setSearch('');
  }, [props.open]);

  const renderTitlesGroup = (items: ChatData[]) =>
    items.map((t) => (
      <HistoryEntry
        onChangeTitle={props.onChangeTitle}
        isActive={props.activeChat?.id == t.id}
        key={t.id}
        entry={t}
        deleteHistory={props.deleteHistory}
        onSelectChat={props.onSelectChat}
      />
    ));

  const getGroupHistory = <T extends { createdAt: Date }>(items: T[]) => {
    const getPreviousDate = (shift: number) => {
      const d = new Date();
      d.setDate(d.getDate() - shift);
      return d;
    };
    const source = (items || [])
      .filter((i) => i.createdAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const result: {
      today: T[];
      last7: T[];
      last30: T[];
      older: T[];
    } = { today: [], last7: [], last30: [], older: [] };
    const yesterday = getPreviousDate(1);
    const last7 = getPreviousDate(7);
    const last30 = getPreviousDate(30);
    for (const item of source) {
      if (item.createdAt > yesterday) result.today.push(item);
      else if (item.createdAt > last7) result.last7.push(item);
      else if (item.createdAt > last30) result.last30.push(item);
      else result.older.push(item);
    }
    return result;
  };

  const handleTabSwitch = async (tabName: string | null) => {
    if (tabName == 'sessions') {
      await props.refreshSessions();
    }
  };

  // Case-insensitive search; tolerant of missing titles.
  const q = search.trim().toLowerCase();
  const filteredChats =
    props.chatData && q
      ? props.chatData.filter((m) => (m.title || '').toLowerCase().includes(q))
      : props.chatData || [];
  const groupedItems = getGroupHistory<ChatData>(filteredChats);
  const hasAny =
    groupedItems.today.length +
      groupedItems.last7.length +
      groupedItems.last30.length +
      groupedItems.older.length >
    0;

  return (
    <components.Container>
      <div className="history-scroll-block">
        <Tabs
          onSelect={handleTabSwitch}
          defaultActiveKey="history"
          id="history-tabs"
          className="mb-0"
        >
          <Tab eventKey="history" title="History">
            <components.SearchWrapper>
              <InputGroup>
                <InputGroup.Text>
                  <IconSearch size={18} />
                </InputGroup.Text>
                <Form.Control
                  type="text"
                  placeholder="Search chats…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </InputGroup>
            </components.SearchWrapper>

            <div className="history-block">
              {!hasAny ? (
                <components.EmptyState>
                  <IconMessage
                    size={28}
                    style={{ opacity: 0.5, marginBottom: '0.8rem' }}
                  />
                  <div>
                    {q
                      ? 'No chats match your search.'
                      : 'No chats yet — start a new conversation to see it here.'}
                  </div>
                </components.EmptyState>
              ) : (
                <>
                  {groupedItems.today.length ? (
                    <>
                      <components.SectionHeader>Today</components.SectionHeader>
                      {renderTitlesGroup(groupedItems.today)}
                    </>
                  ) : null}
                  {groupedItems.last7.length ? (
                    <>
                      <components.SectionHeader>
                        Previous 7 days
                      </components.SectionHeader>
                      {renderTitlesGroup(groupedItems.last7)}
                    </>
                  ) : null}
                  {groupedItems.last30.length ? (
                    <>
                      <components.SectionHeader>
                        Previous 30 days
                      </components.SectionHeader>
                      {renderTitlesGroup(groupedItems.last30)}
                    </>
                  ) : null}
                  {groupedItems.older.length ? (
                    <>
                      <components.SectionHeader>Older</components.SectionHeader>
                      {renderTitlesGroup(groupedItems.older)}
                    </>
                  ) : null}
                </>
              )}
            </div>
          </Tab>

          <Tab eventKey="sessions" title="Sessions">
            <div className="list-container">
              {sessions?.length ? (
                sessions.map((s) => (
                  <components.HistoryEntryContainer key={s.Id}>
                    <div>
                      {!isClosed(s) ? (
                        <>
                          <components.FlexSpaceBetween>
                            <Badge bg="success">Active</Badge>
                            <components.CloseBtn
                              data-testid={`close-session-btn-${s.Id}`}
                              onClick={() => setConfirmingClose(s.Id)}
                            >
                              Close
                            </components.CloseBtn>
                          </components.FlexSpaceBetween>
                          {confirmingClose === s.Id && (
                            <CloseSessionConfirm
                              session={s}
                              onCancel={() => setConfirmingClose(null)}
                              onConfirm={() => {
                                setConfirmingClose(null);
                                props.onCloseSession(s.Id);
                              }}
                            />
                          )}
                        </>
                      ) : null}
                    </div>
                    <components.HistoryItem>
                      <components.ModelName
                        data-rh={abbreviateAddress(s.Id, 3)}
                        data-rh-negative
                      >
                        {s.ModelName}
                      </components.ModelName>
                      <components.Duration>
                        {((s.EndsAt - s.OpenedAt) / 60).toFixed(0)} min
                      </components.Duration>
                    </components.HistoryItem>
                  </components.HistoryEntryContainer>
                ))
              ) : (
                <components.EmptyState>
                  No active sessions yet.
                </components.EmptyState>
              )}
            </div>
          </Tab>
        </Tabs>
      </div>
    </components.Container>
  );
};
