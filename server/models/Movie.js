import mongoose from "mongoose";

const movieSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  duration: { type: Number },
  language: { type: String },
  genre: { type: String },
  poster: { type: String },
  // add more fields as needed
});

const Movie = mongoose.model("Movie", movieSchema);

export default Movie;
