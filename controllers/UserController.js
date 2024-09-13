import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import UserModel from './../models/User.js';

import nodemailer from 'nodemailer'
import bcrypt from 'bcrypt'
import UserOTPVerification from '../models/UserOTPVerification.js';

import Mailgen from 'mailgen';
import User from './../models/User.js';

export const updateInfo = async(req, res) => {
    try {
        const user = await User.findOneAndUpdate({ _id: req.body.userId },
            {
                // email: req.body.email,
                company: req.body.company,
                name: req.body.name,
                // photo: req.body.photo,
                nomination: req.body.nomination,
                job: req.body.job,
                about: req.body.about,
            },
            { new: true }
        )
        if(!user){
            throw new Error("Пользователь не найден")
        }
        res.json(user)
    } catch (error) {
        console.log(error.message)
    }
}

export const updateSocialInfo = async(req, res) => {
    try {
        const user = await User.findOneAndUpdate({ _id: req.body.userId },
            {
                // email: req.body.email,
                instagram: req.body.instagram,
                vk: req.body.vk,
                // photo: req.body.photo,
                tiktok: req.body.tiktok,
                youtube: req.body.youtube,
            },
            { new: true }
        )
        if(!user){
            throw new Error("Пользователь не найден")
        }
        res.json(user)
    } catch (error) {
        console.log(error.message)
    }
}

export const register = async (req, res) => {
    try {
        const existUser = await UserModel.findOne({ email: req.body.email });
        if(existUser){
            sendOTPVerificationEmail({_id: existUser._id, email: req.body.email})
            const token = jwt.sign({
                _id: existUser._id,
            }, 'secret123', {
                expiresIn: "30d",
            });
    
            const { ...userData } = existUser._doc;
            res.json({
                ...userData,
                token,
            });
        }else{
            const doc = new UserModel({
                email: req.body.email,
                role: req.body.role,
                verified: false
            });
    
            const user = await doc.save().then((result) => {
                sendOTPVerificationEmail(result);
                return result;
            });
    
            const token = jwt.sign({
                _id: user._id
            }, 'secret123', {
                expiresIn: "30d",
            });
    
            const { passwordHash, ...userData } = user._doc;
            res.json({
                ...userData,
                token,
            });
        }

    } catch (err) {
        console.log(err);
        res.status(500).json({
            message: "Не удалось зарегистрироваться",
        });
    }
}

const auth = {
    user: process.env.USER,
    pass: process.env.PASS
}

const transporter = nodemailer.createTransport({
    // host: 'smtp.ethereal.email',
    // secure: true,
    // port: 465,
    service: "gmail",
    auth: {
        // user: "weds.astana@gmail.com",
        // pass: "ufok hbei qkso egod"
        user: process.env.USER,
        pass: process.env.PASS
    },
  });

  const sendOTPVerificationEmail = async ({_id, email}) => {
    try {
        const otp = `${Math.floor(1000 + Math.random() * 9000)}`; // Генерация случайного OTP
        console.log(otp); // Вывод для отладки

        // Настройка письма
        const mailOptions = {
            from: auth.user, // используем email, указанный в auth
            to: email, // email получателя
            subject: "Verify Your Email",
            html: `<p>Ваш код верификации: ${otp}</p>`
        };

        const saltRounds = 10;
        const hashedOTP = await bcrypt.hash(otp, saltRounds);

        // Сохраняем OTP в базе данных
        const newOtpVerification = await new UserOTPVerification({
            userId: _id,
            realOtp: otp,
            otp: hashedOTP,
            createdAt: Date.now(),
            expiresAt: Date.now() + 3600000, // 1 час
        });

        await newOtpVerification.save();
        await transporter.sendMail(mailOptions); // Отправляем email
        console.log('Email отправлен успешно');

    } catch (error) {
        console.error("Ошибка при отправке email:", error.message); // Выводим ошибку для отладки
        throw new Error(error.message);
    }
};


export const verifyOTP = async (req, res) => {
    try {
        let { userId, otp } = req.body;

        if (!userId || !otp) {
            throw new Error("Empty otp details are not allowed");
        }

        const UserOTPVerificationRecords = await UserOTPVerification.find({ userId });
        
        if (UserOTPVerificationRecords.length <= 0) {
            throw new Error("Account record doesn't exist");
        }

        const { expiresAt, otp: hashedOTP, realOtp } = UserOTPVerificationRecords[0];

        if (expiresAt < Date.now()) {
            await UserOTPVerification.deleteMany({ userId });
            throw new Error("Код устарел, попробуйте ещё раз.");
        }

        const validOTP = await bcrypt.compare(otp, hashedOTP);
        console.log("valid",validOTP, "real otp", otp, realOtp)
        // console.log(otp, )

        if (!validOTP) {
            throw new Error("Неверный код. Проверьте свою почту!");
        }

        const user = await User.findOne({ _id: userId });

        await UserOTPVerification.deleteMany({ userId });

        res.json({
            status: "VERIFIED",
            message: user.name ? "exist" : "new",
        });
    } catch (error) {
        console.log(error.message)
    }
};


export const resendOTP = async (req, res) => {
    try {
        let { userId, email } = req.body;

        if (!userId || !email) {
            throw new Error("Не получилось найти такой email");
        }

        // Удаляем старые записи перед созданием нового OTP
        await UserOTPVerification.deleteMany({ userId });

        // Генерируем и отправляем новый код
        await sendOTPVerificationEmail({ _id: userId, email });

        res.json({
            status: "PENDING",
            message: "Письмо отправлено на вашу почту"
        });
    } catch (error) {
        res.json({
            status: "FAILED",
            message: error.message
        });
    }
};





export const getUserByToken = async (req, res) => {
    try {
        const token = (req.headers.authorization || '').replace(/Bearer\s?/, '');
        const decoded = jwt.verify(token, 'secret123')

        const user = await User.findOne({ _id: decoded._id });        

        if (!user) {
            return res.json({
                message: "Пользователь не найден"
            });
        }


        const { ...userData } = user._doc;
        res.json({
            ...userData,
            token,
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({
            message: "Не удалось авторизоваться"
        });
    }
}


export const loginAdmin = async (req, res) => {
    const id = req.body.id;
    const user = await User.findOne({ _id: id })

    if(user && user.role == "admin"){
        res.json("success")
    }else{
        return res.status(500).json({
            message: "Не получилось авторизоваться",
        });
    }
}


export const loginJoury = async (req, res) => {
    const id = req.body.id;
    const user = await User.findOne({ _id: id })

    if(user && user.role == "joury"){
        res.json("success")
    }else{
        return res.status(500).json({
            message: "Не получилось авторизоваться",
        });
    }
}

