import mongoose from "mongoose";

const ColorSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    img: {
        type: String
    },
})

export default mongoose.model('Colors', ColorSchema);