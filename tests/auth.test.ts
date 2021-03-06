import supertest from "supertest";
import { Pool } from "pg";
import app from "../app";
import seed from "../db/seed";
import issueJWT from "../utils/issueJWT";
import jsonwebtoken from "jsonwebtoken";

const api = supertest(app);

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "market_api",
  password: "password",
  port: 5432,
});

const query = (text: string, params: unknown[]) => pool.query(text, params);

describe("Auth routes testing", () => {
  beforeEach(async () => {
    await seed(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("Register route", () => {
    test("Should add new user to database", async () => {
      const res = await api
        .post("/auth/register")
        .send({
          username: "newuser",
          email: "newuser@email.com",
          password: "password",
        })
        .expect(200);

      expect(res.body.userId).toBe(11);
      expect(res.body.username).toBe("newuser");
      expect(res.body.email).toBe("newuser@email.com");
      expect(res.body.token).not.toBeUndefined();
      expect(res.body.expires).not.toBeUndefined();

      const users = await query(`SELECT * FROM app_user`, []);
      expect(users.rows.length).toBe(11);
    });

    test("Should not add new user if no username", async () => {
      const res = await api
        .post("/auth/register")
        .send({ email: "new@email.com", password: "password" })
        .expect(400);

      expect(res.body.error).toBe('"username" is required');

      const users = await query(`SELECT * FROM app_user`, []);
      expect(users.rows.length).toBe(10);
    });

    test("Should not add new user if username too short", async () => {
      const res = await api
        .post("/auth/register")
        .send({ username: "new", email: "new@email.com", password: "password" })
        .expect(400);

      expect(res.body.error).toBe(
        '"username" length must be at least 4 characters long'
      );

      const users = await query(`SELECT * FROM app_user`, []);
      expect(users.rows.length).toBe(10);
    });

    test("Should not add new user if username too long", async () => {
      const res = await api
        .post("/auth/register")
        .send({
          username: "n".repeat(33),
          email: "new@email.com",
          password: "password",
        })
        .expect(400);

      expect(res.body.error).toBe(
        '"username" length must be less than or equal to 32 characters long'
      );

      const users = await query(`SELECT * FROM app_user`, []);
      expect(users.rows.length).toBe(10);
    });

    test("Should not add new user if username already exists", async () => {
      const res = await api
        .post("/auth/register")
        .send({
          username: "test",
          email: "new@email.com",
          password: "password",
        })
        .expect(400);

      expect(res.body.error).toBe("username already exists");

      const users = await query(`SELECT * FROM app_user`, []);
      expect(users.rows.length).toBe(10);
    });

    test("Should not add new user if no email", async () => {
      const res = await api
        .post("/auth/register")
        .send({
          username: "newuser",
          password: "password",
        })
        .expect(400);

      expect(res.body.error).toBe('"email" is required');

      const users = await query(`SELECT * FROM app_user`, []);
      expect(users.rows.length).toBe(10);
    });

    test("Should not add new user if email not right format", async () => {
      const res = await api
        .post("/auth/register")
        .send({
          username: "newuser",
          email: "newuser@email",
          password: "password",
        })
        .expect(400);

      expect(res.body.error).toBe('"email" must be a valid email');

      const users = await query(`SELECT * FROM app_user`, []);
      expect(users.rows.length).toBe(10);
    });

    test("Should not add new user if no password", async () => {
      const res = await api
        .post("/auth/register")
        .send({
          username: "newuser",
          email: "new@email.com",
        })
        .expect(400);

      expect(res.body.error).toBe('"password" is required');

      const users = await query(`SELECT * FROM app_user`, []);
      expect(users.rows.length).toBe(10);
    });

    test("Should not add new user if password too short", async () => {
      const res = await api
        .post("/auth/register")
        .send({
          username: "newuser",
          email: "new@email.com",
          password: "pass",
        })
        .expect(400);

      expect(res.body.error).toBe(
        '"password" length must be at least 8 characters long'
      );

      const users = await query(`SELECT * FROM app_user`, []);
      expect(users.rows.length).toBe(10);
    });

    test("Should not add new user if password too long", async () => {
      const res = await api
        .post("/auth/register")
        .send({
          username: "newuser",
          email: "new@email.com",
          password: "p".repeat(65),
        })
        .expect(400);

      expect(res.body.error).toBe(
        '"password" length must be less than or equal to 64 characters long'
      );

      const users = await query(`SELECT * FROM app_user`, []);
      expect(users.rows.length).toBe(10);
    });
  });

  describe("Login route", () => {
    test("Should log user in", async () => {
      const res = await api
        .post("/auth/login")
        .send({
          email: "test@email.com",
          password: "password",
        })
        .expect(200);

      expect(res.body.userId).toBe(1);
      expect(res.body.username).toBe("test");
      expect(res.body.email).toBe("test@email.com");
      expect(res.body.token).not.toBeUndefined();
      expect(res.body.expires).not.toBeUndefined();
    });

    test("Should not log user in if password incorrect", async () => {
      const res = await api
        .post("/auth/login")
        .send({
          email: "test@email.com",
          password: "incorrectPassword",
        })
        .expect(400);

      expect(res.body.error).toBe("Incorrect username or password");
    });

    test("Should not log user in if email does not exist", async () => {
      const res = await api
        .post("/auth/login")
        .send({
          email: "incorrect@email.com",
          password: "password",
        })
        .expect(400);

      expect(res.body.error).toBe("Incorrect username or password");
    });

    test("Should not log user in if no email", async () => {
      const res = await api
        .post("/auth/login")
        .send({
          password: "test",
        })
        .expect(400);

      expect(res.body.error).toBe('"email" is required');
    });

    test("Should not log user in if no password", async () => {
      const res = await api
        .post("/auth/login")
        .send({
          email: "test@email.com",
        })
        .expect(400);

      expect(res.body.error).toBe('"password" is required');
    });
  });
});
