import express from "express";
import pg, { Client } from "pg";
import bodyParser from "body-parser";
import axios from "axios"; 
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
// const DATABASE_URL = "postgres://postgres:postgres@localhost:5432/book_collection";

const db = new pg.Client({
  // user: "postgres",
  // host: "localhost",
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // database: "book_collection",
  // password: "postgres",
  // port: 5432,
});
db.connect();

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.json());

app.get("/", async (req, res) => {
  try {
    // const result = await db.query("SELECT * FROM books");
    const result = await db.query("SELECT * FROM books WHERE is_tbr = false");
    const books = await Promise.all(result.rows.map(async (book) => {
      // Construct Open Library cover URL from ISBN
      const coverUrl = book.isbn 
        ? `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg`
        : null;
        return {
        ...book,
        cover_url: coverUrl || book.cover_url,
      };
    }));
    const totalBooks = books.length;
    res.render("index.ejs", { books:result.rows, totalBooks});
  } catch (error) {
    console.error(error);
    res.status(500).send('Error loading books');
  }
});

app.post("/books/add", async (req, res) => {
  const { title, author, isbn, cover_url, rating, review } = req.body;

  try {
    await db.query(
      "INSERT INTO books (title, author, isbn, cover_url, rating, review) VALUES ($1, $2, $3, $4, $5, $6)",
      [title, author, isbn || null, cover_url || null, rating, review || null]
    );
    res.redirect("/");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error saving the book");
  }
});

// New API to get book info from Open Library and save it
app.post("/books/add-by-isbn", async (req, res) => {
  const { isbn } = req.body;

  try {
    // Fetch data from Open Library API
    const openLibUrl = `https://openlibrary.org/isbn/${isbn}.json`;
    const response = await axios.get(openLibUrl);
    const bookData = response.data;

    // Build cover URL from ISBN (might need fallback logic)
    const coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

    // Extract data safely, some fields might be missing
    const title = bookData.title || "Unknown Title";
    const author = bookData.authors && bookData.authors.length > 0
      ? await (async () => {
          const authResp = await axios.get(`https://openlibrary.org${bookData.authors[0].key}.json`);
          return authResp.data.name;
        })()
      : "Unknown Author";

    // Insert into your DB with default rating and empty review
    await db.query(
      "INSERT INTO books (title, author, isbn, cover_url, rating, review) VALUES ($1, $2, $3, $4, $5, $6)",
      [title, author, isbn, coverUrl, null, null]
    );

    res.redirect("/");
  } catch (error) {
    console.error("Error fetching book data:", error);
    res.status(500).send("Error fetching or saving book info");
  }
});

// Serve edit form with current book data
app.get('/books/edit/:id', async (req, res) => {
  const bookId = req.params.id;
  try {
    const { rows } = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
    if (rows.length === 0) {
      return res.status(404).send('Book not found');
    }
    res.render('edit.ejs', { book: rows[0] });
  } catch (error) {
    res.status(500).send('Error loading book for edit');
  }
});

// Handle edit form submission and update DB
app.post('/books/edit/:id', async (req, res) => {
  const bookId = req.params.id;
  const { title, author, isbn, cover_url, rating, review } = req.body;

  try {
    await db.query(
      'UPDATE books SET title=$1, author=$2, isbn=$3, cover_url=$4, rating=$5, review=$6 WHERE id=$7',
      [title, author, isbn || null, cover_url || null, rating, review || null, bookId]
    );
    res.redirect('/');
  } catch (error) {
    res.status(500).send('Error updating book');
  }
});

// Handle delete book POST request
app.post('/books/delete/:id', async (req, res) => {
  const bookId = req.params.id;
  try {
    await db.query('DELETE FROM books WHERE id = $1', [bookId]);
    res.redirect('/');
  } catch (error) {
    res.status(500).send('Error deleting book');
  }
});

app.get("/tbr", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM books WHERE is_tbr = true");
    res.render("tbr.ejs", { books: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error loading TBR books");
  }
});

app.post("/tbr/add", async (req, res) => {
  const { title, author, isbn, cover_url, rating, review } = req.body;

  try {
    await db.query(
      `INSERT INTO books (title, author, isbn, cover_url, rating, review, is_tbr)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [title, author, isbn || null, cover_url || null, rating || null, review || null]
    );
    res.redirect("/tbr");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error saving TBR book");
  }
});

app.post("/tbr/move-to-read/:id", async (req, res) => {
  const bookId = req.params.id;

  try {
    await db.query(
      "UPDATE books SET is_tbr = false WHERE id = $1",
      [bookId]
    );
    res.redirect("/tbr");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error moving book to read list");
  }
});



app.listen(port, ()=>{
    console.log(`app is running at port ${port} succesfully`);
})