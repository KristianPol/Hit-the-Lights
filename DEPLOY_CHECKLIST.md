## Deployment Checklist for Postgres

### ✅ Completed

- [x] Postgres tables created in Supabase (empty schema, no data)
- [x] Backend code updated to detect and use Postgres when DATABASE_URL is set
- [x] Fallback to SQLite when DATABASE_URL is not set (for local dev)
- [x] Backend compiles successfully
- [x] Migration script ready (`src/backend/scripts/migrate_schema_to_postgres.js`)

### 🔄 Next: Deploy to Render

1. **Set Render environment variable**
   - Go to your Render backend service dashboard
   - Settings → Environment
   - Add: `DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.tubpwysojkbkzqsuwebs.supabase.co:5432/postgres`
   - Note: Use the correct password from your Supabase project

2. **Deploy**
   - Trigger a redeploy on Render (or push to your repo if auto-deploy is enabled)
   - Backend will auto-detect DATABASE_URL and use Postgres
   - Check logs: should show `🗄️ Database Mode: Postgres`

3. **Verify**
   - Health endpoint: `https://your-render-backend.onrender.com/api/health`
   - Should return: `{"status":"OK","database":"Postgres"}`

### 🔐 Security: Rotate the password

The `.env` file in your repo contains the database password. **After confirming deployment works**:

1. Go to Supabase dashboard
2. Project Settings → Database → Credentials
3. Click "Reset Password" (generates new password)
4. Update:
   - `.env` (local testing)
   - Render environment variable `DATABASE_URL`
5. Commit updated `.env` only to a private repo

### 📝 Local testing (optional)

To test Postgres locally (requires network connectivity):

```powershell
cd src/backend
npm install dotenv
npm run build
npm start
# Check logs for: "🗄️ Database Mode: Postgres"
```

If DNS/network blocks Postgres (error: ENOTFOUND):
- Use a different network (phone hotspot)
- Or test via Render instead (backend runs in cloud where outbound 5432 is allowed)

### 📋 Future work (Phase 2)

Services currently warn about sync vs async. For full Postgres support, refactor:
- `AuthenticationService`
- `SongService`
- `FriendshipService`
- `MessageService`
- `UserService`

Use the `PostgresDB` helper (`src/backend/database/postgres-db.ts`) with async/await.

### 📞 Current status

- Backend: ✅ Postgres-ready
- Database: ✅ Tables created
- Routers: ⚠️ Services warn about async (fallback mode)
- Deployment: Ready for Render with DATABASE_URL env

All files committed. Deploy and enjoy!

