import express from "express";
import {loginUser, registerUser, resetPassword, sendOTP, verifyOTP} from '../controllers/auth.controller.js';
const router = express.Router();

router.post("/signup", registerUser)
router.post("/login", loginUser);
router.post('/otp/send', sendOTP);
router.post("/otp/verify", verifyOTP);
router.post("/password/reset", resetPassword);

export default router;