export type AchievementCategory = 'Skill' | 'Progression' | 'Social';

export interface Achievement {
  id: string; // unique id
  name: string;
  description: string;
  criteria: string;
  category: AchievementCategory;
  // runtime state
  unlocked?: boolean;
  progress?: number; // current progress (0..target)
  target?: number; // if numeric achievement, the number to reach
  pinned?: boolean; // if user pinned this achievement to profile
}

