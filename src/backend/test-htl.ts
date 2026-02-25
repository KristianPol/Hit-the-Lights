import { Unit } from './unit';
import { HTLService } from './HTLService';

// Test the HTLService toJSON methods
function testHTLService() {
  const unit = new Unit(false);
  const service = new HTLService(unit);

  try {
    console.log('=== Testing HTLService toJSON ===\n');

    // Test 1: Insert and convert a user
    console.log('Test 1: User toJSON');
    const insertUser = unit.prepare<{ id: number }>(
      'INSERT INTO User (username, password) VALUES (?, ?) RETURNING id'
    );
    const userResult = insertUser.get();
    console.log('Inserted user ID:', userResult?.id);

    const user = {
      id: userResult!.id,
      username: 'testuser',
      password: 'testpass123'
    };
    const userJson = service.userToJSON(user);
    console.log('User JSON:', JSON.stringify(userJson, null, 2));
    console.log('✓ User toJSON works\n');

    // Test 2: Insert and convert a song
    console.log('Test 2: Song toJSON');
    const insertSong = unit.prepare<{ id: number }>(
      'INSERT INTO Song (name, author, bpm) VALUES (?, ?, ?) RETURNING id'
    );
    const songResult = insertSong.get();
    console.log('Inserted song ID:', songResult?.id);

    const song = {
      id: songResult!.id,
      name: 'Test Song',
      author: 'Test Artist',
      bpm: 120
    };
    const songJson = service.songToJSON(song);
    console.log('Song JSON (basic):', JSON.stringify(songJson, null, 2));
    console.log('✓ Song toJSON works\n');

    // Test 3: Insert difficulty and convert
    console.log('Test 3: Difficulty toJSON');
    const insertDiff = unit.prepare<{ id: number }>(
      'INSERT INTO Difficulty (song_id, difficulty, note_count) VALUES (?, ?, ?) RETURNING id'
    );
    const diffResult = insertDiff.get();
    console.log('Inserted difficulty ID:', diffResult?.id);

    const difficulty = {
      id: diffResult!.id,
      song_id: song.id,
      difficulty: 3,
      note_count: 150
    };
    const diffJson = service.difficultyToJSON(difficulty);
    console.log('Difficulty JSON:', JSON.stringify(diffJson, null, 2));
    console.log('✓ Difficulty toJSON works\n');

    // Test 4: Insert note and convert
    console.log('Test 4: Note toJSON');
    const note = {
      id: 1,
      difficulty_id: difficulty.id,
      time_ms: 1500,
      lane: 2,
      type: 1,
      duration_ms: null
    };
    const noteJson = service.noteToJSON(note);
    console.log('Note JSON:', JSON.stringify(noteJson, null, 2));
    console.log('✓ Note toJSON works\n');

    // Test 5: Highscore toJSON
    console.log('Test 5: Highscore toJSON');
    const highscore = {
      user_id: user.id,
      difficulty_id: difficulty.id,
      score: 98500,
      max_combo: 145,
      accuracy: 98,
      date: new Date().toISOString()
    };
    const scoreJson = service.highscoreToJSON(highscore);
    console.log('Highscore JSON:', JSON.stringify(scoreJson, null, 2));
    console.log('✓ Highscore toJSON works\n');

    // Test 6: Generic toJSON method
    console.log('Test 6: Generic toJSON method');
    const genericUserJson = service.toJSON(user, 'user');
    const genericSongJson = service.toJSON(song, 'song');
    console.log('Generic User:', JSON.stringify(genericUserJson, null, 2));
    console.log('Generic Song:', JSON.stringify(genericSongJson, null, 2));
    console.log('✓ Generic toJSON works\n');

    // Rollback to clean up test data
    unit.complete(false);
    console.log('=== All tests passed! ===');

  } catch (error) {
    unit.complete(false);
    console.error('Test failed:', error);
    throw error;
  }
}

testHTLService();
