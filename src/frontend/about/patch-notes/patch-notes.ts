import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-patch-notes',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './patch-notes.html',
  styleUrls: ['./patch-notes.scss']
})
export class PatchNotesPage {}
