import { Router } from "express";
import authRouter from "./auth";
import usersRouter from "./users";
import apiKeysRouter from "./api-keys";
import identitiesRouter from "./identities";

const router = Router();

router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/users/me/api-keys", apiKeysRouter);
router.use("/users/me/identities", identitiesRouter);

export default router;
