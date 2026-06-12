import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AchievementService } from '../../app/services/achievement.service';
import { Achievement } from '../../app/services/achievement.model';

@Component({
  selector: 'app-achievements',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './achievements.html',
  styleUrls: ['./achievements.scss']
})
export class AchievementsComponent implements OnInit {
  private achievementsSignal = signal<Achievement[]>([]);
  readonly filterSignal = signal<'All' | 'Skill' | 'Progression' | 'Social'>('All');

  constructor(private achievementService: AchievementService) {}

  ngOnInit(): void {
    this.achievementService.refreshForCurrentUser();
    this.achievementsSignal.set(this.achievementService.all());
  }

  get achievements(): Achievement[] {
    const filter = this.filterSignal();
    const list = this.achievementsSignal();
    if (filter === 'All') return list;
    return list.filter(a => a.category === filter);
  }

  pinnedCount(): number {
    return this.achievementService.pinned().length;
  }

  togglePin(id: string): void {
    const result = this.achievementService.togglePin(id);
    if (result === 'limit') {
      alert('You can pin up to 5 achievements. Unpin one to add another.');
    } else if (result === 'locked') {
      alert('You can only pin unlocked achievements.');
    }
    this.achievementsSignal.set(this.achievementService.all());
  }

  formatProgress(a: Achievement): string {
    if (typeof a.target !== 'number') return a.unlocked ? 'Unlocked' : 'Locked';
    return `${Math.min(a.progress ?? 0, a.target)}/${a.target}`;
  }

  categoryIcon(category: string): string {
    switch (category) {
      case 'Skill': return 'fa-star';
      case 'Progression': return 'fa-trophy';
      case 'Social': return 'fa-users';
      default: return 'fa-medal';
    }
  }
}

