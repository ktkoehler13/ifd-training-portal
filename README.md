# IFD Training Portal

Next.js prototype for Ithaca Fire Department training request workflows.

## Getting Started

Copy the example environment file and set local values:

```bash
cp .env.local.example .env.local
```

Required local variables:

- `NEXT_PUBLIC_DEPARTMENT_ACCESS_CODE` — prototype landing-page access code
- `NEXT_PUBLIC_GSA_MILEAGE_RATE` — example mileage rate only; replace it with the approved current GSA rate before calculating real reimbursements
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key

Never commit `.env.local`. Never add a Supabase service-role key to browser code or to `.env.local.example`.

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase Setup

### 1. Create a Supabase project

1. Sign in to [Supabase](https://supabase.com/).
2. Create a new project for development.
3. Choose a strong database password and save it securely.

### 2. Find the project URL and anon key

In the Supabase dashboard:

1. Open **Project Settings**.
2. Open **API**.
3. Copy **Project URL** into `NEXT_PUBLIC_SUPABASE_URL`.
4. Copy **anon public** key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Use only the anon key in this application. Do not expose the service-role key in the browser or in committed files.

### 3. Configure `.env.local`

Add the Supabase values alongside the existing prototype variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Restart `npm run dev` after changing environment variables.

### 4. Run the migration

Apply the personnel migration using one of these methods:

**Supabase SQL editor**

1. Open **SQL** in the Supabase dashboard.
2. Paste the contents of `supabase/migrations/20260718140000_create_personnel.sql`.
3. Run the script.

**Supabase CLI (optional)**

If you use the Supabase CLI locally, link the project and run:

```bash
supabase db push
```

### 5. Insert a few test users

Use `supabase/seed.example.sql` as a development-only guide.

1. Open the Supabase SQL editor.
2. Uncomment the example inserts you want to use.
3. Run them manually.

The repository includes only fake example badge numbers and example emails such as `firefighter.example@ifd-prototype.local`.

Do not add real personnel information to the repository or to shared development projects until Microsoft 365 authentication is implemented.

### 6. Open the prototype admin page

After entering the department access code, visit:

```text
/admin/users
```

The page is protected only by the prototype session for navigation. Supabase Row Level Security remains enabled and will block anonymous reads and writes until Microsoft 365 authentication is connected.

## Personnel Data Model

The `personnel` table stores only:

- badge number
- department email
- role
- active status
- created/updated timestamps

It intentionally does **not** store names, phone numbers, addresses, passwords, medical information, or payroll information.

## Security Notes

- The department access code is a temporary prototype gate, not production security.
- Row Level Security is enabled on `personnel`.
- Anonymous users cannot read or write personnel records.
- Future Microsoft 365 authenticated users will be matched to personnel rows by email.
- Firefighters will eventually read only their own row.
- MTO and Deputy Chief users will eventually read active personnel needed for routing.
- Only admins will eventually insert, update, deactivate, or change roles.

## Useful Commands

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
