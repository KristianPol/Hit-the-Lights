import { Injectable } from '@angular/core';
import { signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Achievement } from './achievement.model';
import { AuthService } from './auth.service';
import { FriendshipService } from './friendship.service';
import { SongService } from './song.service';

const STORAGE_PREFIX = 'htl_achievements_v2_user_';
const LEGACY_STORAGE_KEY = 'htl_achievements_v1';
const META_STORAGE_PREFIX = 'htl_achievement_meta_v1_user_';

type PersistedAchievementState = {
  id: string;
  unlocked: boolean;
  pinned: boolean;
  progress: number;
};

type AchievementMeta = {
  completedSongIds: number[];
  scoreShares: number;
  commentsPosted: number;
  leaderboardFirstSongIds: number[];
};

export type TogglePinResult = 'ok' | 'limit' | 'locked' | 'missing';

@Injectable({ providedIn: 'root' })
export class AchievementService {
  private achievementsSignal = signal<Achievement[]>(this.loadBaseDefinitions());

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private friendshipService: FriendshipService,
    private songService: SongService
  ) {
    this.refreshForCurrentUser();
    this.authService.currentUser$.subscribe(() => {
      this.refreshForCurrentUser();
    });
  }

  all(): Achievement[] {
    return this.achievementsSignal();
  }

  get(id: string): Achievement | undefined {
    return this.all().find(a => a.id === id);
  }

  refreshForCurrentUser(): void {
    const fallback = this.loadBaseDefinitions();
    this.applyLocalState(fallback, this.currentStorageKey());

    const userId = this.authService.currentUser?.id;
    if (!userId) {
      this.achievementsSignal.set(fallback);
      this.syncFriendAchievementProgress();
      return;
    }

    this.http.get<{ success: boolean; achievements?: PersistedAchievementState[] }>(`/api/auth/user/${userId}/achievements`).subscribe({
      next: response => {
        const list = this.loadBaseDefinitions();
        this.applyLocalState(list, this.currentStorageKey());
        if (response.success && Array.isArray(response.achievements)) {
          this.applySavedState(list, response.achievements);
        }
        this.achievementsSignal.set(list);
        this.syncFriendAchievementProgress();
        this.syncPlaytimeAchievementProgress();
        this.syncDistinctSongsProgress();
      },
      error: () => {
        this.achievementsSignal.set(fallback);
        this.syncFriendAchievementProgress();
        this.syncPlaytimeAchievementProgress();
        this.syncDistinctSongsProgress();
      }
    });
  }

  togglePin(id: string): TogglePinResult {
    const list = this.all().map(a => ({ ...a }));
    const idx = list.findIndex(x => x.id === id);
    if (idx === -1) {
      return 'missing';
    }

    const currentlyPinned = list[idx].pinned;

    if (!currentlyPinned) {
      if (!list[idx].unlocked) {
        return 'locked';
      }
      const pinnedCount = list.filter(x => x.pinned).length;
      if (pinnedCount >= 5) {
        return 'limit';
      }
    }

    list[idx].pinned = !currentlyPinned;
    this.achievementsSignal.set(list);
    this.persistState();
    return 'ok';
  }

  incrementProgress(id: string, amount = 1): void {
    const list = this.all().map(a => ({ ...a }));
    const idx = list.findIndex(x => x.id === id);
    if (idx === -1) return;
    const item = list[idx];
    item.progress = (item.progress ?? 0) + amount;
    if (typeof item.target === 'number' && item.progress >= item.target) {
      item.unlocked = true;
      item.progress = item.target;
    }

    this.achievementsSignal.set(list);
    this.persistState();
  }

  unlock(id: string): void {
    const list = this.all().map(a => ({ ...a }));
    const idx = list.findIndex(x => x.id === id);
    if (idx === -1) return;
    list[idx].unlocked = true;
    if (list[idx].target && (!list[idx].progress || list[idx].progress < list[idx].target)) {
      list[idx].progress = list[idx].target;
    }
    this.achievementsSignal.set(list);
    this.persistState();
  }

  pinned(): Achievement[] {
    return this.all().filter(a => a.pinned);
  }

  // ---------------------------------------------------------------------------
  // Run-based skill achievements
  // ---------------------------------------------------------------------------
  checkRunAchievements(params: {
    maxCombo: number;
    accuracy: number;
    miss: number;
    difficultyLevel: number;
    songId: number;
    rank: string;
  }): void {
    const { maxCombo, accuracy, miss, difficultyLevel, songId, rank } = params;

    // Combo achievements
    const comboIds = ['skill.warmup_riff', 'skill.riff_rider', 'skill.solo_surge', 'skill.endless_encore'];
    const comboTargets = [50, 200, 500, 1000];
    for (let i = 0; i < comboIds.length; i++) {
      this.setProgressIfHigher(comboIds[i], maxCombo);
    }

    // Accuracy achievements (one-shot)
    if (accuracy >= 90.0) this.unlock('skill.steady_beat');
    if (accuracy >= 95.0) this.unlock('skill.pulse_perfect');
    if (accuracy >= 98.0) this.unlock('skill.metronome_maestro');
    if (accuracy >= 99.5) this.unlock('skill.quantum_tempo');

    // Zero-miss by difficulty
    if (miss === 0) {
      if (difficultyLevel === 1) this.unlock('skill.first_movement');
      if (difficultyLevel === 2) this.unlock('skill.harmonic_flow');
      if (difficultyLevel === 3) this.unlock('skill.hardline_virtuoso');
      if (difficultyLevel === 4) this.unlock('skill.expert_ascendancy');
    }

    // Rank achievements
    const rankUpper = rank.toUpperCase();
    const isSOrBetter = rankUpper.startsWith('S');
    const isSSOrBetter = rankUpper === 'S+' || rankUpper.startsWith('SS');

    if (isSOrBetter) {
      this.unlock('skill.s_rank_swagger');
      if (difficultyLevel === 3) {
        this.unlock('skill.high_score_headliner');
        if (isSSOrBetter) this.unlock('skill.platinum_performance');
      }
      if (difficultyLevel === 4 && isSSOrBetter) {
        this.unlock('skill.rhythm_legend');
      }
    }

    // Distinct songs progression
    this.addCompletedSong(songId);
  }

  // ---------------------------------------------------------------------------
  // Social: score sharing
  // ---------------------------------------------------------------------------
  trackScoreShare(): void {
    const meta = this.loadMeta();
    meta.scoreShares++;
    this.saveMeta(meta);

    this.setProgressIfHigher('social.share_your_set', meta.scoreShares);
    this.setProgressIfHigher('social.viral_cut', meta.scoreShares);
    this.setProgressIfHigher('social.spotlight_stream', meta.scoreShares);
    this.setProgressIfHigher('social.broadcast_icon', meta.scoreShares);
  }

  // ---------------------------------------------------------------------------
  // Social: comments
  // ---------------------------------------------------------------------------
  trackCommentPosted(): void {
    const meta = this.loadMeta();
    meta.commentsPosted++;
    this.saveMeta(meta);

    this.setProgressIfHigher('social.commentator', meta.commentsPosted);
    this.setProgressIfHigher('social.scene_supporter', meta.commentsPosted);
    this.setProgressIfHigher('social.community_anchor', meta.commentsPosted);
    this.setProgressIfHigher('social.social_conductor', meta.commentsPosted);
  }

  // ---------------------------------------------------------------------------
  // Social: leaderboard position
  // ---------------------------------------------------------------------------
  checkLeaderboardAchievements(songId: number, difficultyId: number): void {
    const userId = this.authService.currentUser?.id;
    if (!userId) return;

    this.songService.getDifficultyLeaderboard(songId, difficultyId, userId).subscribe({
      next: response => {
        if (!response.success || !Array.isArray(response.entries)) return;
        const entry = response.entries.find(e => e.isCurrentUser);
        if (!entry) return;

        const pos = entry.position;

        if (pos <= 100) this.unlock('social.local_leader');
        if (pos <= 10) this.unlock('social.regional_star');
        if (pos === 1) {
          this.unlock('social.world_stage');
          const meta = this.loadMeta();
          if (!meta.leaderboardFirstSongIds.includes(songId)) {
            meta.leaderboardFirstSongIds.push(songId);
            this.saveMeta(meta);
          }
          this.setProgressIfHigher('social.top_of_charts', meta.leaderboardFirstSongIds.length);
        }
      },
      error: () => {}
    });
  }

  // ---------------------------------------------------------------------------
  // Progression: playtime
  // ---------------------------------------------------------------------------
  syncPlaytimeAchievementProgress(): void {
    const user = this.authService.currentUser;
    const seconds = user?.playtimeSeconds ?? 0;

    this.setProgressIfHigher('progression.coffee_break', seconds);
    this.setProgressIfHigher('progression.studio_regular', seconds);
    this.setProgressIfHigher('progression.tour_bus', seconds);
    this.setProgressIfHigher('progression.timeless_performer', seconds);
  }

  // ---------------------------------------------------------------------------
  // Progression: distinct songs
  // ---------------------------------------------------------------------------
  addCompletedSong(songId: number): void {
    const meta = this.loadMeta();
    if (!meta.completedSongIds.includes(songId)) {
      meta.completedSongIds.push(songId);
      this.saveMeta(meta);
    }
    this.syncDistinctSongsProgress();
  }

  syncDistinctSongsProgress(): void {
    const meta = this.loadMeta();
    const count = meta.completedSongIds.length;

    this.setProgressIfHigher('progression.first_track', count);
    this.setProgressIfHigher('progression.set_list_builder', count);
    this.setProgressIfHigher('progression.discography', count);
    this.setProgressIfHigher('progression.living_archive', count);
  }

  // ---------------------------------------------------------------------------
  // Stubs for systems not yet implemented
  // ---------------------------------------------------------------------------
  syncPpAchievementProgress(_pp: number): void {
    // PP system not yet implemented
  }

  syncGlobalRankAchievementProgress(_rank: number): void {
    // Global ranking system not yet implemented
  }

  trackLikeGiven(): void {
    // Like system not yet implemented
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------
  private setProgressIfHigher(id: string, value: number): void {
    const list = this.all().map(a => ({ ...a }));
    const idx = list.findIndex(x => x.id === id);
    if (idx === -1) return;

    const item = list[idx];
    if (typeof item.target !== 'number') return;

    const currentProgress = item.progress ?? 0;
    const nextProgress = Math.min(value, item.target);
    if (nextProgress <= currentProgress && !!item.unlocked) return;

    item.progress = nextProgress;
    if (nextProgress >= item.target) {
      item.unlocked = true;
    }

    this.achievementsSignal.set(list);
    this.persistState();
  }

  private persistState(): void {
    this.saveStateToLocal(this.currentStorageKey());
    const userId = this.authService.currentUser?.id;
    if (!userId) {
      return;
    }

    this.http.post(`/api/auth/user/${userId}/achievements`, {
      achievements: this.all().map(a => ({
        id: a.id,
        unlocked: !!a.unlocked,
        pinned: !!a.pinned,
        progress: a.progress ?? 0
      }))
    }).subscribe({ error: () => {} });
  }

  private saveStateToLocal(key: string): void {
    try {
      const state = this.all().map(a => ({ id: a.id, unlocked: !!a.unlocked, pinned: !!a.pinned, progress: a.progress ?? 0 }));
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save achievements state', e);
    }
  }

  private applyLocalState(list: Achievement[], key: string): void {
    try {
      let raw = localStorage.getItem(key);
      if (!raw) {
        raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      }
      if (!raw) {
        return;
      }

      const saved: Array<{ id: string; unlocked?: boolean; pinned?: boolean; progress?: number }> = JSON.parse(raw);
      this.applySavedState(list, saved);
    } catch (e) {
      console.warn('Failed to load saved achievements', e);
    }
  }

  private applySavedState(
    list: Achievement[],
    saved: Array<{ id: string; unlocked?: boolean; pinned?: boolean; progress?: number }>
  ): void {
    for (const s of saved) {
      const found = list.find(b => b.id === s.id);
      if (!found) {
        continue;
      }

      found.unlocked = !!s.unlocked;
      found.pinned = !!s.pinned;
      if (typeof s.progress === 'number') {
        found.progress = s.progress;
      }
    }

    // Keep pin constraints valid when loading old states.
    const unlockedPinned = list.filter(a => a.pinned && a.unlocked);
    const allowedPinnedIds = new Set(unlockedPinned.slice(0, 5).map(a => a.id));
    for (const item of list) {
      if (item.pinned && !allowedPinnedIds.has(item.id)) {
        item.pinned = false;
      }
    }
  }

  private syncFriendAchievementProgress(): void {
    const userId = this.authService.currentUser?.id;
    if (!userId) {
      return;
    }

    this.friendshipService.getFriends(userId).subscribe({
      next: response => {
        if (!response.success || !Array.isArray(response.friends)) {
          return;
        }
        this.updateFriendProgress(response.friends.length);
      },
      error: () => {}
    });
  }

  private updateFriendProgress(friendCount: number): void {
    const friendAchievementIds = new Set([
      'social.close_knit',
      'social.the_inviter',
      'social.guy_around_town',
      'social.niche_micro_celebrity',
      'social.john_htl'
    ]);

    let changed = false;
    const list = this.all().map(a => {
      if (!friendAchievementIds.has(a.id) || typeof a.target !== 'number') {
        return { ...a };
      }

      const nextProgress = Math.min(friendCount, a.target);
      const nextUnlocked = friendCount >= a.target;
      if ((a.progress ?? 0) !== nextProgress || !!a.unlocked !== nextUnlocked) {
        changed = true;
      }

      return {
        ...a,
        progress: nextProgress,
        unlocked: nextUnlocked
      };
    });

    if (!changed) {
      return;
    }

    this.achievementsSignal.set(list);
    this.persistState();
  }

  private currentStorageKey(): string {
    const userId = this.authService.currentUser?.id;
    return `${STORAGE_PREFIX}${userId ?? 'guest'}`;
  }

  private metaStorageKey(): string {
    const userId = this.authService.currentUser?.id;
    return `${META_STORAGE_PREFIX}${userId ?? 'guest'}`;
  }

  private loadMeta(): AchievementMeta {
    try {
      const raw = localStorage.getItem(this.metaStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          completedSongIds: Array.isArray(parsed.completedSongIds) ? parsed.completedSongIds : [],
          scoreShares: typeof parsed.scoreShares === 'number' ? parsed.scoreShares : 0,
          commentsPosted: typeof parsed.commentsPosted === 'number' ? parsed.commentsPosted : 0,
          leaderboardFirstSongIds: Array.isArray(parsed.leaderboardFirstSongIds) ? parsed.leaderboardFirstSongIds : []
        };
      }
    } catch {
      // ignore
    }
    return {
      completedSongIds: [],
      scoreShares: 0,
      commentsPosted: 0,
      leaderboardFirstSongIds: []
    };
  }

  private saveMeta(meta: AchievementMeta): void {
    try {
      localStorage.setItem(this.metaStorageKey(), JSON.stringify(meta));
    } catch (e) {
      console.warn('Failed to save achievement meta', e);
    }
  }

  public loadBaseDefinitions(): Achievement[] {
    const list: Achievement[] = [
      // Skill
      { id: 'skill.warmup_riff', name: 'Warm-Up Riff', description: 'Start your climb — land a steady combo and feel the groove.', criteria: 'Hit a 50-note combo in a single song without breaking the combo.', category: 'Skill', target: 50, progress: 0 },
      { id: 'skill.riff_rider', name: 'Riff Rider', description: 'Your rhythm is tightening — keep the streak going and impress the crowd.', criteria: 'Hit a 200-note combo in a single song without breaking the combo.', category: 'Skill', target: 200, progress: 0 },
      { id: 'skill.solo_surge', name: 'Solo Surge', description: 'You’re unstoppable — sustain a long, flawless run of notes.', criteria: 'Hit a 500-note combo in a single song without breaking the combo.', category: 'Skill', target: 500, progress: 0 },
      { id: 'skill.endless_encore', name: 'Endless Encore', description: 'True mastery — an epic, marathon combo that leaves jaws on the floor.', criteria: 'Hit a 1000-note combo in a single play session (uninterrupted).', category: 'Skill', target: 1000, progress: 0 },

      { id: 'skill.steady_beat', name: 'Steady Beat', description: 'Clean and consistent — deliver a solid performance.', criteria: 'Achieve 90.0% or higher accuracy on a single song.', category: 'Skill', target: 1, progress: 0 },
      { id: 'skill.pulse_perfect', name: 'Pulse Perfect', description: 'Near-professional timing — your timing starts to sing.', criteria: 'Achieve 95.0% or higher accuracy on a single song.', category: 'Skill', target: 1, progress: 0 },
      { id: 'skill.metronome_maestro', name: 'Metronome Maestro', description: 'Surgeon-like timing — you’re threading the needle with every note.', criteria: 'Achieve 98.0% or higher accuracy on a single song.', category: 'Skill', target: 1, progress: 0 },
      { id: 'skill.quantum_tempo', name: 'Quantum Tempo', description: 'Flawless timing — everything you touch is a masterpiece.', criteria: 'Achieve 99.5% or higher accuracy on a single song.', category: 'Skill', target: 1, progress: 0 },

      { id: 'skill.first_movement', name: 'First Movement', description: 'Clean run — finish a song without a single miss on easy.', criteria: 'Complete any Easy-difficulty song with zero misses.', category: 'Skill', target: 1, progress: 0 },
      { id: 'skill.harmonic_flow', name: 'Harmonic Flow', description: 'Rhythm under pressure — finish a song without a single miss on normal.', criteria: 'Complete any Normal-difficulty song with zero misses.', category: 'Skill', target: 1, progress: 0 },
      { id: 'skill.hardline_virtuoso', name: 'Hardline Virtuoso', description: 'Tough and tidy — conquer hard charts with no breaks.', criteria: 'Complete any Hard-difficulty song with zero misses.', category: 'Skill', target: 1, progress: 0 },
      { id: 'skill.expert_ascendancy', name: 'Expert Ascendancy', description: 'The summit of precision — immaculate expert runs are your signature.', criteria: 'Complete any Expert-difficulty song with zero misses.', category: 'Skill', target: 1, progress: 0 },

      { id: 'skill.s_rank_swagger', name: 'S-Rank Swagger', description: 'The judges notice — earn top-tier recognition on a standard chart.', criteria: 'Earn an S-rank on any song at any difficulty.', category: 'Skill', target: 1, progress: 0 },
      { id: 'skill.high_score_headliner', name: 'High Score Headliner', description: 'You headline the scoreboards — push a Hard chart into the top bracket.', criteria: 'Earn an S-rank on a Hard-difficulty song.', category: 'Skill', target: 1, progress: 0 },
      { id: 'skill.platinum_performance', name: 'Platinum Performance', description: 'Elite performer — reach S+ (or the best available rank) on a Hard chart.', criteria: 'Earn an SS or S+ on a Hard-difficulty song.', category: 'Skill', target: 1, progress: 0 },
      { id: 'skill.rhythm_legend', name: 'Rhythm Legend', description: 'Legendary timing and stamina — the community recognizes your peak plays.', criteria: 'Earn SS/S+ on an Expert-difficulty song.', category: 'Skill', target: 1, progress: 0 },

      // Progression
      { id: 'progression.first_track', name: 'First Track', description: 'That first victory is sweet — one song down, many more to go.', criteria: 'Complete 1 distinct song (any difficulty).', category: 'Progression', target: 1, progress: 0 },
      { id: 'progression.set_list_builder', name: 'Set List Builder', description: 'Building an arsenal — expand your completed catalog.', criteria: 'Complete 50 distinct songs at least once.', category: 'Progression', target: 50, progress: 0 },
      { id: 'progression.discography', name: 'Discography', description: 'A large and varied repertoire — you’ve mastered a hefty library.', criteria: 'Complete 200 distinct songs at least once.', category: 'Progression', target: 200, progress: 0 },
      { id: 'progression.living_archive', name: 'Living Archive', description: 'An unmatched collection — nearly every note is familiar to you.', criteria: 'Complete 500 distinct songs at least once.', category: 'Progression', target: 500, progress: 0 },

      { id: 'progression.coffee_break', name: 'Coffee Break', description: 'You’re invested — a little practice goes a long way.', criteria: 'Accumulate 1 hour of total playtime.', category: 'Progression', target: 3600, progress: 0 },
      { id: 'progression.studio_regular', name: 'Studio Regular', description: 'Practice makes progress — you’re putting in meaningful time.', criteria: 'Accumulate 10 hours of total playtime.', category: 'Progression', target: 36000, progress: 0 },
      { id: 'progression.tour_bus', name: 'Tour Bus', description: 'Veteran hours — the set list is a second language.', criteria: 'Accumulate 100 hours of total playtime.', category: 'Progression', target: 360000, progress: 0 },
      { id: 'progression.timeless_performer', name: 'Timeless Performer', description: 'This is your world — sheer dedication and time spent in rhythm.', criteria: 'Accumulate 500 hours of total playtime.', category: 'Progression', target: 1800000, progress: 0 },

      { id: 'progression.pp_first_drop', name: 'First Drop', description: 'Your first PP milestone is in the books - keep building your performance rating.', criteria: 'Reach 100 total performance points (PP).', category: 'Progression', target: 100, progress: 0 },
      { id: 'progression.pp_groove_meter', name: 'Groove Meter', description: 'Your consistency is paying off and your PP keeps climbing.', criteria: 'Reach 1,000 total performance points (PP).', category: 'Progression', target: 1000, progress: 0 },
      { id: 'progression.pp_rhythm_engine', name: 'Rhythm Engine', description: 'You are becoming a serious contender with a strong PP profile.', criteria: 'Reach 5,000 total performance points (PP).', category: 'Progression', target: 5000, progress: 0 },
      { id: 'progression.pp_legend_clocked', name: 'Legend Clocked', description: 'Elite status unlocked - your PP total speaks for itself.', criteria: 'Reach 20,000 total performance points (PP).', category: 'Progression', target: 20000, progress: 0 },

      { id: 'progression.global_break_in', name: 'Global Break-In', description: 'You are now visible on the world stage - keep pushing your rank upward.', criteria: 'Reach top 10,000 in overall global ranking.', category: 'Progression', target: 1, progress: 0 },
      { id: 'progression.global_riser', name: 'Global Riser', description: 'The climb gets real - your name is rising through the global ladder.', criteria: 'Reach top 1,000 in overall global ranking.', category: 'Progression', target: 1, progress: 0 },
      { id: 'progression.global_spotlight', name: 'Global Spotlight', description: 'You are now among the best in the world - every run matters.', criteria: 'Reach top 100 in overall global ranking.', category: 'Progression', target: 1, progress: 0 },
      { id: 'progression.global_maestro', name: 'Global Maestro', description: 'Absolute peak rhythm status - the world leaderboard has your name at the summit.', criteria: 'Reach #1 in overall global ranking.', category: 'Progression', target: 1, progress: 0 },

      // Social: sharing
      { id: 'social.share_your_set', name: 'Share Your Set', description: 'Show the world your best moments — sharing is caring.', criteria: 'Share a score or clip to an external platform or the game feed once.', category: 'Social', target: 1, progress: 0 },
      { id: 'social.viral_cut', name: 'Viral Cut', description: 'You’re sharing highlights like a pro — more people see your plays.', criteria: 'Share 10 scores or clips.', category: 'Social', target: 10, progress: 0 },
      { id: 'social.spotlight_stream', name: 'Spotlight Stream', description: 'Your highlights get around — your plays are worth watching.', criteria: 'Share 50 scores or clips.', category: 'Social', target: 50, progress: 0 },
      { id: 'social.broadcast_icon', name: 'Broadcast Icon', description: 'Your streamed highlights are regular viewing — premiere material.', criteria: 'Share 200 scores or clips.', category: 'Social', target: 200, progress: 0 },

      // Social: leaderboards
      { id: 'social.local_leader', name: 'Local Leader', description: 'You broke into the local top — a small community admires your runs.', criteria: 'Place in the local top 100 on any song leaderboard.', category: 'Social', target: 1, progress: 0 },
      { id: 'social.regional_star', name: 'Regional Star', description: 'You’re on people’s radar — climb higher on leaderboards.', criteria: 'Place in the top 10 on any song leaderboard.', category: 'Social', target: 1, progress: 0 },
      { id: 'social.world_stage', name: 'World Stage', description: 'A top-level performer — elite leaderboard presence.', criteria: 'Place #1 on any song leaderboard regionally or globally.', category: 'Social', target: 1, progress: 0 },
      { id: 'social.top_of_charts', name: 'Top of the Charts', description: 'Dynasty-level consistency across songs — a champion among champions.', criteria: 'Achieve #1 leaderboard placement on 10 distinct songs.', category: 'Social', target: 10, progress: 0 },

      // Social: comments & replies
      { id: 'social.commentator', name: 'Commentator', description: 'You’re joining the conversation — engage and uplift others.', criteria: 'Post 5 comments on other players’ scores or replays.', category: 'Social', target: 5, progress: 0 },
      { id: 'social.scene_supporter', name: 'Scene Supporter', description: 'You’re an active part of the community — keep the good vibes flowing.', criteria: 'Post 50 comments or replies on other players’ content.', category: 'Social', target: 50, progress: 0 },
      { id: 'social.community_anchor', name: 'Community Anchor', description: 'You meaningfully shape the community with consistent interaction.', criteria: 'Post 200 comments/replies and receive at least 50 replies to your posts.', category: 'Social', target: 200, progress: 0 },
      { id: 'social.social_conductor', name: 'Social Conductor', description: 'Your community presence is official — you spark conversations and shape trends.', criteria: 'Post 1000 comments/replies and receive at least 500 replies/likes across them.', category: 'Social', target: 1000, progress: 0 },

      // Social: likes
      { id: 'social.likes_and_love', name: 'Likes & Love', description: 'Kindness counts — you show appreciation for other players’ plays.', criteria: 'Give 10 likes to other players\' content.', category: 'Social', target: 10, progress: 0 },
      { id: 'social.fanbase_builder', name: 'Fanbase Builder', description: 'You cultivate engagement across the community.', criteria: 'Give 100 likes to other players\' content.', category: 'Social', target: 100, progress: 0 },
      { id: 'social.social_tastemaker', name: 'Social Tastemaker', description: 'You’re a prominent encourager — your activity fuels the scene.', criteria: 'Give 500 likes to other players\' content.', category: 'Social', target: 500, progress: 0 },
      { id: 'social.gratitude_maestro', name: 'Gratitude Maestro', description: 'An extraordinary social contributor — your support is legendary.', criteria: 'Give 2000 likes to other players\' content.', category: 'Social', target: 2000, progress: 0 },

      // Friend-count achievements with requested titles
      { id: 'social.close_knit', name: 'Close-Knit', description: 'You have built a small circle of jam buddies - quality over quantity.', criteria: 'Have 5 accepted friends in your friends list.', category: 'Social', target: 5, progress: 0 },
      { id: 'social.the_inviter', name: 'The Inviter', description: 'You’re the one people invite first — your party grows.', criteria: 'Have 10 accepted friends in your friends list.', category: 'Social', target: 10, progress: 0 },
      { id: 'social.guy_around_town', name: 'Guy Around Town', description: 'Folks know you — your network keeps expanding across the scene.', criteria: 'Have 50 accepted friends in your friends list.', category: 'Social', target: 50, progress: 0 },
      { id: 'social.niche_micro_celebrity', name: 'Niche Micro-Celebrity', description: 'A hundred fans — your style resonates with many.', criteria: 'Have 100 accepted friends in your friends list.', category: 'Social', target: 100, progress: 0 },
      { id: 'social.john_htl', name: 'John HTL', description: 'A thousand followers — legendary social reach in the community.', criteria: 'Have 1000 accepted friends in your friends list.', category: 'Social', target: 1000, progress: 0 }
    ];
    return list;
  }
}
