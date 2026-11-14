import type { ISODate } from './api';

/** What changed on a Trello card since its content was last sent to Claude. */
export type ContentChange =
  | { field: 'title'; before: string; after: string }
  | { field: 'description'; before: string; after: string }
  | { field: 'labels'; added: string[]; removed: string[] }
  | { field: 'checklist'; added: string[]; removed: string[]; completed: string[]; reopened: string[] };

export type TrelloCommentDto = {
  id: string;
  author: string;
  text: string;
  date: ISODate;
  /** Posted from Ticket2PR (a client update or questions), not by the client. */
  fromTicket2pr: boolean;
  /** Newer than what Claude last saw. */
  isNew: boolean;
};

/** `GET /api/cards/{id}/trello-updates`: the conversation on Trello and what's new for Claude. */
export type TrelloUpdatesDto = {
  changes: ContentChange[];
  comments: TrelloCommentDto[];
  /** When Claude last received the card's content and comments (null: never). */
  sentAt: ISODate | null;
};

/** Last usage report of the Claude subscription, from a run. */
export type ClaudeUsageDto = {
  status: 'allowed' | 'allowed_warning' | 'rejected';
  /** 0–1, when reported. */
  utilization: number | null;
  resetsAt: ISODate | null;
  /** e.g. "five_hour", "seven_day". */
  limitType: string | null;
  reportedAt: ISODate;
};

/** `GET /api/claude/usage`. */
export type ClaudeUsageStateDto = {
  /** Usage limit reached: queued runs wait until then. */
  pausedUntil: ISODate | null;
  usage: ClaudeUsageDto | null;
};

export type NotificationKind = 'RUN_SUCCEEDED' | 'RUN_FAILED' | 'QUESTIONS' | 'CLIENT_REPLIED' | 'PAUSED';

/** `GET /api/notifications?after=`: things worth telling the developer about. */
export type NotificationDto = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  projectId: string | null;
  cardId: string | null;
  at: ISODate;
};

export type NotificationsDto = {
  now: ISODate;
  /** Queued or running runs, so the client polls faster while work is going on. */
  activeRuns: number;
  events: NotificationDto[];
};
