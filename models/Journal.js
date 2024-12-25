import mongoose from "mongoose";

const JournalSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    par: {
        type: String
    },
    text: {
        type: String,
        required: true
    },
    img: {
        type: String
    },
    colors: [String],
    brand: String,
    type: String,
    subType: String,
    isAdd: Boolean,
    isMetr: {
        type: Boolean,
        default: false
    },
    files: [String]

})

export default mongoose.model('Journal', JournalSchema);