import mongoose from "mongoose";

const FilesSchema = new mongoose.Schema({
    files: [
        {
            subType: {
                type: String,
                required: true
            },
            file: {
                type: String,
                required: true
            },
            title: String
        }
    ]
})

export default mongoose.model('Files', FilesSchema);