# Rural Connections Admin

Desktop operations console for the Rural Connections marketplace. It shares
the production Supabase project with the Expo app and relies on Supabase Auth,
row-level security, and the `profiles.is_admin` flag for access control.

## Local setup

Copy `.env.example` to `.env.local` and supply the Supabase project URL and
publishable key, then run:

```sh
npm install
npm run dev
```

## Vercel

Import the parent `difm-rural` repository and set the Root Directory to
`admin-web`. Add both variables from `.env.example` to the Vercel project.

The production and preview URLs must also be allowed under Supabase
Authentication > URL Configuration so passwordless sign-in can return to
`/auth/callback`.
