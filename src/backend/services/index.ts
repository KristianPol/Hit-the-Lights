import { RegistrationService as RegistrationServiceSync } from './RegistrationService';
import type { RegistrationRequest, RegistrationResponse } from './RegistrationService';
import { AuthenticationService as AuthenticationServiceSync } from './AuthenticationService';
import type { LoginRequest, LoginResponse } from './AuthenticationService';
import { SongService as SongServiceSync } from './SongService';
import type {
  AddSongRequest,
  AddSongResponse,
  SongResponse,
  UpdateSongVisibilityRequest,
  UpdateSongVisibilityResponse
} from './SongService';
import { RegistrationServiceAsync } from './RegistrationServiceAsync';
import { AuthenticationServiceAsync } from './AuthenticationServiceAsync';
import SongServiceAsync from './SongServiceAsync';

const usePostgres = !!process.env['DATABASE_URL'];

export const RegistrationService = (usePostgres ? RegistrationServiceAsync : RegistrationServiceSync) as any;
export type { RegistrationRequest, RegistrationResponse };
export const AuthenticationService = (usePostgres ? AuthenticationServiceAsync : AuthenticationServiceSync) as any;
export type { LoginRequest, LoginResponse };
export const SongService = (usePostgres ? SongServiceAsync : SongServiceSync) as any;
export type {
  AddSongRequest,
  AddSongResponse,
  SongResponse,
  UpdateSongVisibilityRequest,
  UpdateSongVisibilityResponse
};
import { UserService as UserServiceSync } from './UserService';
import type { UpdateProfilePictureRequest, UpdateProfilePictureResponse, GetUserResponse } from './UserService';
import { FriendshipService as FriendshipServiceSync } from './FriendshipService';
import type { SearchUserResult, FriendRequestResult, FriendshipResult, FriendActionResult } from './FriendshipService';
import { MessageService as MessageServiceSync } from './MessageService';
import type { SendMessageRequest, SendMessageResult, MessageResult, ConversationPreview } from './MessageService';

import FriendshipServiceAsync from './FriendshipServiceAsync';
import MessageServiceAsync from './MessageServiceAsync';
import UserServiceAsync from './UserServiceAsync';

export const UserService = (usePostgres ? UserServiceAsync : UserServiceSync) as any;
export type { UpdateProfilePictureRequest, UpdateProfilePictureResponse, GetUserResponse };
export const FriendshipService = (usePostgres ? FriendshipServiceAsync : FriendshipServiceSync) as any;
export type { SearchUserResult, FriendRequestResult, FriendshipResult, FriendActionResult };
export const MessageService = (usePostgres ? MessageServiceAsync : MessageServiceSync) as any;
export type { SendMessageRequest, SendMessageResult, MessageResult, ConversationPreview };

import { HTLService as HTLServiceSync } from './HTLService';
import HTLServiceAsync from './HTLServiceAsync';
export const HTLService = (usePostgres ? HTLServiceAsync : HTLServiceSync) as any;
