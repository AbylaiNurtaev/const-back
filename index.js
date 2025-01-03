import express from 'express';
import mongoose from 'mongoose';
import chalk from 'chalk';
import handleValidationErrors from './utils/handleValidationErrors.js';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs'
import crypto from 'crypto'
dotenv.config();

import sharp from 'sharp';
import cors from 'cors'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

import { fileURLToPath } from 'url';
import * as JournalController from './controllers/JournalController.js'
import * as ColorsController from './controllers/ColorsController.js'
import * as FilesController from './controllers/FilesController.js'
import Journal from './models/Journal.js';

import Colors from './models/Colors.js';

const bucketName = process.env.BUCKET_NAME
const bucketRegion = process.env.BUCKET_REGION
const accesskey = process.env.ACCESS_KEY
const secretAccessKey = process.env.SECRET_ACCESS_KEY


const s3 = new S3Client({
  credentials: {
    accessKeyId: accesskey,
    secretAccessKey: secretAccessKey
  },
  region: bucketRegion
})





const errorMsg = chalk.bgWhite.redBright;
const successMsg = chalk.bgGreen.white;

const randomImageName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex')


// mongoose.connect(process.env.MONGODB_URI)
mongoose.connect('mongodb+srv://1shtoriitochka:20060903@cluster0.i72zp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')

.then(() => console.log(successMsg("DB ok")))
.catch((err) => console.log(errorMsg("DB error:", err)))

const app = express();

app.use(cors({
  origin: '*', // Укажите домен вашего фронтенда
  methods: ['GET','PATCH', 'POST', 'PUT', 'DELETE'],
  credentials: true, // Если нужны куки или авторизация
}));


app.use(express.json());

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })



// Вспомогательная функция для генерации подписанной ссылки
async function getSignedUrlForKey(key) {
  const getObjectParams = {
    Bucket: bucketName,
    Key: key
  };
  const command = new GetObjectCommand(getObjectParams);
  try {
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    return url;
  } catch (err) {
    console.error('Ошибка при генерации подписанной ссылки:', err);
    return null;
  }
}







app.post('/uploadArticlePhoto/:id', upload.single('image'), async (req, res) => {
  const articleId = req.params.id;

  try {
    // Проверяем, является ли ID валидным ObjectId
    if (!mongoose.Types.ObjectId.isValid(articleId)) {
      return res.status(400).json({ error: 'Некорректный формат ID' });
    }

    // Находим запись в базе
    const oldUser = await Journal.findOne({ _id: articleId });

    // Если запись существует, проверяем и удаляем старое изображение
    if (oldUser) {
      const oldImage = oldUser.img;
      if (oldImage && oldImage.length >= 1) {
        const commandDelete = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: oldImage,
        });
        await s3.send(commandDelete);
      }
    }

    // Загружаем новое изображение
    const buffer = await sharp(req.file.buffer).toBuffer();
    const imageName = randomImageName();

    const params = {
      Bucket: bucketName,
      Key: imageName,
      Body: buffer,
      ContentType: req.file.mimetype,
    };

    const command = new PutObjectCommand(params);
    await s3.send(command);

    // Обновляем запись или создаем новую
    const post = await Journal.findOneAndUpdate(
      { _id: articleId },
      { img: imageName },
      { new: true, upsert: true } // upsert создаёт запись, если её нет
    );

    res.json(post);
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ message: 'Ошибка при обновлении изображения' });
  }
});



app.post('/createJournal', JournalController.createJournal)
app.get('/getJournal', JournalController.getLatestJournal)
app.get('/getColorsNames', ColorsController.getLatestJournal)

app.get('/getJournals', async(req, res) => {
  try {
    // Находим самую свежую запись, отсортированную по дате создания
    const id = req.params.id;
    const latestFaq = await Journal.find();

    if (!latestFaq) {
      return res.status(404).json({ message: "FAQ не найден." });
    }

    for(let i = 0; i < latestFaq.length; i++){
      if(latestFaq[i].img && latestFaq[i].img.length >= 1){
        const img = await getSignedUrlForKey(latestFaq[i].img);
        latestFaq[i].img = img
      }
    }

    res.status(200).json(latestFaq);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Произошла ошибка при получении FAQ" });   
}
}
)
app.get('/getColors', async(req, res) => {
  try {    
    const latestFaq = await Colors.find();

    if (!latestFaq) {
      return res.status(404).json({ message: "FAQ не найден." });
    }

    for(let i = 0; i < latestFaq.length; i++){
      if(latestFaq[i].img && latestFaq[i].img.length >= 1){
        const img = await getSignedUrlForKey(latestFaq[i].img);
        latestFaq[i].img = img
      }
    }

    res.status(200).json(latestFaq);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Произошла ошибка при получении FAQ" });   
}
}
)

app.get('/getJournalById/:id', async(req, res) => {
  try {
    // Находим самую свежую запись, отсортированную по дате создания
    const id = req.params.id;
    const latestFaq = await Journal.findOne({_id: id});

    if (!latestFaq) {
      return res.status(404).json({ message: "FAQ не найден." });
    }

    if(latestFaq.img && latestFaq.img.length >= 1){
      const img = await getSignedUrlForKey(latestFaq.img);
      latestFaq.img = img
    }

    res.status(200).json(latestFaq);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Произошла ошибка при получении FAQ" });   
}
}
)
app.get('/getColorById/:id', async(req, res) => {
  try {
    // Находим самую свежую запись, отсортированную по дате создания
    const id = req.params.id;
    const latestFaq = await Colors.findOne({_id: id});

    if (!latestFaq) {
      return res.status(404).json({ message: "FAQ не найден." });
    }

    if(latestFaq.img && latestFaq.img.length >= 1){
      const img = await getSignedUrlForKey(latestFaq.img);
      latestFaq.img = img
    }

    res.status(200).json(latestFaq);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Произошла ошибка при получении FAQ" });   
}
}
)

app.post('/updateJournal', JournalController.updateJournal)
app.post('/deleteJournal', JournalController.deleteJournal)

app.post('/updateColor', ColorsController.updateJournal)
app.post('/deleteColor', ColorsController.deleteJournal)


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}


app.post('/uploadImage', upload.single('image'), (req, res) => {
  try {
      if (!req.file) {
          return res.status(400).json({ success: false, message: 'No file uploaded!' });
      }

      // URL загруженного файла
      const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

      res.json({
          success: true,
          fileUrl,
      });
  } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Server error!' });
  }
});


app.post('/uploadArticlePhoto/:id', upload.single('image'), async (req, res) => {
  const articleId = req.params.id;

  try {
    // Проверяем, является ли ID валидным ObjectId
    if (!mongoose.Types.ObjectId.isValid(articleId)) {
      return res.status(400).json({ error: 'Некорректный формат ID' });
    }

    // Находим запись в базе
    const oldUser = await Journal.findOne({ _id: articleId });

    // Если запись существует, проверяем и удаляем старое изображение
    if (oldUser) {
      const oldImage = oldUser.img;
      if (oldImage && oldImage.length >= 1) {
        const commandDelete = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: oldImage,
        });
        await s3.send(commandDelete);
      }
    }

    // Загружаем новое изображение
    const buffer = await sharp(req.file.buffer).toBuffer();
    const imageName = randomImageName();

    const params = {
      Bucket: bucketName,
      Key: imageName,
      Body: buffer,
      ContentType: req.file.mimetype,
    };

    const command = new PutObjectCommand(params);
    await s3.send(command);

    // Обновляем запись или создаем новую
    const post = await Journal.findOneAndUpdate(
      { _id: articleId },
      { img: imageName },
      { new: true, upsert: true } // upsert создаёт запись, если её нет
    );

    res.json(post);
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ message: 'Ошибка при обновлении изображения' });
  }
});


app.post('/uploadColor/:id', upload.single('image'), async (req, res) => {
  const articleId = req.params.id;

  try {
    // Проверяем, является ли ID валидным ObjectId
    if (!mongoose.Types.ObjectId.isValid(articleId)) {
      return res.status(400).json({ error: 'Некорректный формат ID' });
    }

    // Находим запись в базе
    const oldUser = await Colors.findOne({ _id: articleId });

    // Если запись существует, проверяем и удаляем старое изображение
    if (oldUser) {
      const oldImage = oldUser.img;
      if (oldImage && oldImage.length >= 1) {
        const commandDelete = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: oldImage,
        });
        await s3.send(commandDelete);
      }
    }

    // Загружаем новое изображение
    const buffer = await sharp(req.file.buffer).toBuffer();
    const imageName = randomImageName();

    const params = {
      Bucket: bucketName,
      Key: imageName,
      Body: buffer,
      ContentType: req.file.mimetype,
    };

    const command = new PutObjectCommand(params);
    await s3.send(command);

    // Обновляем запись или создаем новую
    const post = await Colors.findOneAndUpdate(
      { _id: articleId },
      { img: imageName },
      { new: true, upsert: true } // upsert создаёт запись, если её нет
    );

    res.json(post);
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ message: 'Ошибка при обновлении изображения' });
  }
});

app.post('/uploadFile', upload.single('document'), FilesController.uploadFile);
app.get('/getFile/:id', FilesController.getFile);
app.delete('/deleteFile/:id', FilesController.deleteFile);
app.get('/getFiles', FilesController.getFiles)



// Раздача статических файлов (загруженные изображения)
app.use('/uploads', express.static(uploadDir));





const port = process.env.PORT || 3001

app.listen(port, function(){
    console.log(successMsg("listening port:", port));
  });



