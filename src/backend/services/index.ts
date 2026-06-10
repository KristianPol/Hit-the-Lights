import { RegistrationService } from './RegistrationService';
import type { RegistrationRequest, RegistrationResponse } from './RegistrationService';
import { AuthenticationService } from './AuthenticationService';
import type { LoginRequest, LoginResponse } from './AuthenticationService';
import { SongService } from './SongService';
import type {
  AddSongRequest,
  AddSongResponse,
  SongResponse,
  UpdateSongVisibilityRequest,
  UpdateSongVisibilityResponse
} from './SongService';
import { UserService } from './UserService';
import type { UpdateProfilePictureRequest, UpdateProfilePictureResponse, GetUserResponse } from './UserService';
import { FriendshipService } from './FriendshipService';
import type { SearchUserResult, FriendRequestResult, FriendshipResult, FriendActionResult } from './FriendshipService';
import { MessageService } from './MessageService';
import type { SendMessageRequest, SendMessageResult, MessageResult, ConversationPreview } from './MessageService';
import { HTLService } from './HTLService';
import { R2Service } from './R2Service';

export type { RegistrationRequest, RegistrationResponse };
export type { LoginRequest, LoginResponse };
export type {
  AddSongRequest,
  AddSongResponse,
  SongResponse,
  UpdateSongVisibilityRequest,
  UpdateSongVisibilityResponse
};
export type { UpdateProfilePictureRequest, UpdateProfilePictureResponse, GetUserResponse };
export type { SearchUserResult, FriendRequestResult, FriendshipResult, FriendActionResult };
export type { SendMessageRequest, SendMessageResult, MessageResult, ConversationPreview };

export { RegistrationService, AuthenticationService, SongService, UserService, FriendshipService, MessageService, HTLService, R2Service };
