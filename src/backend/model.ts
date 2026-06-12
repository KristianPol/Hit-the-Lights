export type User = {
  id : number,
  username: string,
  password?: string,
  profilePicture?: Buffer | null,
  profilePictureUrl?: string | null,
  joinDate: string,
  playtimeSeconds?: number,
  role?: string,
  isBanned?: boolean,
  bio?: string | null,
  location?: string | null,
  favoriteGenre?: string | null,
  githubUrl?: string | null,
  osuUrl?: string | null,
  robloxUrl?: string | null,
  discordUrl?: string | null,
  youtubeUrl?: string | null,
  twitchUrl?: string | null,
  totalSp?: number
};

export interface UserControls {
  userId: number;
  laneBindingsJson: string;
  noteSpeed: number;
  updatedAt?: string;
}

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
  genre?: string | null;
  playCount?: number;
  likeCount?: number;
  isLikedByUser?: boolean;
}
// TODO add more types for DB Entities
