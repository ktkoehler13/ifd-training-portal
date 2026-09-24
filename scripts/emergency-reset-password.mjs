import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing Supabase environment variables in .env.local.");
  process.exit(1);
}

const badgeNumber = process.argv[2];
const newPassword = process.env.NEW_PASSWORD;

if (!badgeNumber) {
  console.error("Badge number is required.");
  process.exit(1);
}

if (!newPassword) {
  console.error("NEW_PASSWORD is required.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { data: personnel, error: personnelError } = await supabase
  .from("personnel")
  .select("id, badge_number, email, active")
  .eq("badge_number", badgeNumber)
  .maybeSingle();

if (personnelError) {
  console.error("Unable to look up personnel:", personnelError.message);
  process.exit(1);
}

if (!personnel) {
  console.error(`No personnel record found for badge ${badgeNumber}.`);
  process.exit(1);
}

if (!personnel.active) {
  console.error(`Badge ${badgeNumber} is inactive.`);
  process.exit(1);
}

const normalizedEmail = personnel.email.trim().toLowerCase();

let matchingUsers = [];
let page = 1;

while (page <= 10) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage: 200,
  });

  if (error) {
    console.error("Unable to read Auth users:", error.message);
    process.exit(1);
  }

  matchingUsers.push(
    ...data.users.filter(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail,
    ),
  );

  if (data.users.length < 200) break;
  page += 1;
}

if (matchingUsers.length !== 1) {
  console.error(
    `Expected exactly one Auth user for badge ${badgeNumber}, found ${matchingUsers.length}.`,
  );
  process.exit(1);
}

const authUser = matchingUsers[0];

const { error: passwordError } = await supabase.auth.admin.updateUserById(
  authUser.id,
  {
    password: newPassword,
    email_confirm: true,
  },
);

if (passwordError) {
  console.error("Unable to update password:", passwordError.message);
  process.exit(1);
}

const { error: flagError } = await supabase
  .from("personnel")
  .update({
    must_change_password: false,
  })
  .eq("id", personnel.id);

if (flagError) {
  console.error(
    "Password changed, but unable to clear password-change requirement:",
    flagError.message,
  );
  process.exit(1);
}

console.log(`Password reset successfully for badge ${badgeNumber}.`);
