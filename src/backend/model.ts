export type User = {
  id : number,
  username: string,
  password: string
};

export interface Song {
  id: number;
  name: string;
  author: string;
  bpm: number;
  cover: string;
  audioUrl: string;
  length: string
}
// TODO add more types for DB Entities
