export type User = {
  id : number,
  username: string,
  password: string,
  profilePicture?: Buffer | null
};

export interface Song {
  id: number;
  name: string;
  author: string;
  bpm: number;
  cover: string;
  audioUrl: string;
  length: string;
  ownerId?: number | null;
  isPublic?: boolean;
}
// TODO add more types for DB Entities
