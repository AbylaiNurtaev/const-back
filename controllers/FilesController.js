import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import sharp from 'sharp';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Files from '../models/Files.js'; // импорт модели файлов
import { randomUUID } from 'crypto';

dotenv.config();

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

const s3 = new S3Client({
    credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretAccessKey,
    },
    region: bucketRegion,
});

const randomImageName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

export const getFiles = async (req, res) => {
    try {
        const files = await Files.find(); // Получаем все файлы из базы данных
        res.status(200).json(files);
    } catch (error) {
        console.error('Ошибка при получении файлов:', error);
        res.status(500).json({ message: 'Произошла ошибка при получении файлов' });
    }
}

// Загрузка файла
export const uploadFile = async (req, res) => {
    try {
        // Проверяем наличие файла
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ error: 'Файл не загружен или поврежден' });
        }

        // Генерация уникального имени файла
        const fileName = `${randomUUID()}.pdf`;

        // Загрузка файла в S3
        const params = {
            Bucket: bucketName,
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        await s3.send(new PutObjectCommand(params));

        // Сохранение данных о файле в MongoDB
        const fileData = {
            subType: req.body.subType,
            file: fileName,
            title: req.body.title || null,
        };

        // Записываем данные в MongoDB асинхронно
        Files.findOneAndUpdate(
            {},
            { $push: { files: fileData } },
            { upsert: true, new: true }
        ).exec();

        // Возвращаем ответ без ожидания завершения записи в MongoDB
        res.status(200).json({ success: true, id: fileName });
    } catch (error) {
        console.error('Ошибка загрузки файла:', error);
        res.status(500).json({ error: 'Ошибка при загрузке файла' });
    }
};


// Получение файла (ссылка)
export const getFile = async (req, res) => {
    try {
      const { id } = req.params;
  
      // Проверяем, является ли ID валидным ObjectId
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Некорректный формат ID' });
      }
  
      // Поиск документа, содержащего массив files с элементом, имеющим указанный _id
      const filesRecord = await Files.findOne({ 'files._id': id });
  
      if (!filesRecord) {
        return res.status(404).json({ error: 'Файл не найден в базе данных' });
      }
  
      // Поиск элемента в массиве files по _id
      const file = filesRecord.files.find((elem) => elem._id.toString() === id);
  
      if (!file) {
        return res.status(404).json({ error: 'Файл не найден в массиве files' });
      }
  
      // Параметры для получения файла из S3
      const getObjectParams = {
        Bucket: bucketName,
        Key: file.file, // Поле file содержит ключ для S3
      };
  
      // Генерация временной ссылки
      const command = new GetObjectCommand(getObjectParams);
      const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
  
      res.status(200).json({ success: true, url });
    } catch (error) {
      console.error('Ошибка при получении файла:', error);
      res.status(500).json({ error: 'Произошла ошибка при получении файла' });
    }
  };
  
  

// Удаление файла
export const deleteFile = async (req, res) => {
    try {
        const { id } = req.params;
        console.log(id);
        
    
        // Проверяем, является ли ID валидным ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({ error: 'Некорректный формат ID' });
        }
    
        // Находим запись с данным ID
        const fileRecord = await Files.findOne({ 'files._id': id });
    
        if (!fileRecord) {
          return res.status(404).json({ error: 'Файл не найден в базе данных' });
        }
    
        // Находим индекс файла в массиве files
        const fileIndex = fileRecord.files.findIndex((file) => file._id.toString() === id);
    
        if (fileIndex === -1) {
          return res.status(404).json({ error: 'Файл не найден в массиве записей' });
        }
    
        // Удаляем файл из массива
        const deletedFile = fileRecord.files[fileIndex];
        fileRecord.files.splice(fileIndex, 1);
        await fileRecord.save();
    
        // (Необязательно) Удаление файла из S3
        const deleteParams = {
          Bucket: bucketName,
          Key: deletedFile.file, // Предполагается, что `file` содержит ключ файла в S3
        };
        await s3.send(new DeleteObjectCommand(deleteParams));
    
        res.status(200).json({ message: 'Файл успешно удален', deletedFile });
      } catch (error) {
        console.error('Ошибка при удалении файла:', error);
        res.status(500).json({ error: 'Произошла ошибка при удалении файла' });
      }
    
};
