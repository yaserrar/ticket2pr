/** Trello objects as the board and list pickers need them. */
export type TrelloMemberDto = { id: string; username: string; fullName: string };

export type TrelloBoardDto = { id: string; name: string; url: string };

export type TrelloListDto = { id: string; name: string };
