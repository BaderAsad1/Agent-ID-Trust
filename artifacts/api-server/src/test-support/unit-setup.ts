// Unit tests mock persistence at the service boundary, but importing the DB
// package still requires a syntactically valid URL. Keep this deliberately
// non-routable so a missing mock fails instead of touching a developer DB.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://agentid_test:agentid_test@127.0.0.1:1/agentid_test";
