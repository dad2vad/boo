import { type Handler } from "$fresh/server.ts";
import { Hono } from "hono";

const app = new Hono();
app
  .get("/h", (c) => c.text("Hello world!"))
  .get(
    "/i/:name",
    (c) => c.text(`Hi, ${c.req.param("name")}!`),
  );

const handle = (subApp: Hono, path = "/"): Handler => (req) =>
  new Hono().route(path, subApp).fetch(req);

export const handler = handle(app, "/api");
