import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcryptjs";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import env from "dotenv";

const port = process.env.PORT || 3000;
const app = express();
const saltRounds = 10; //10 salt rounds are being used in the bcrypt hashing of user password.
env.config();

//To dynamically get the current year
const d = new Date();
let year = d.getFullYear();

//Middlewears
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    //set an expiry time limit for your session using below code

    /* cookie: {
       maxAge: 1000 * 60 * 60 * 24 //expiry date is 1 day
     } */
}));


app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());


//connecting database
const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
    });
    
    db.connect();



let idUser = 0; 

//function to fetch the data of the particular user. User is selected on basis of id provided
async function getMyBooks(id){
    const result =
    await db.query(
        "SELECT * FROM notes JOIN books ON notes.book_id = books.id JOIN users ON notes.user_id = users.id WHERE user_id = $1 ORDER BY rating DESC",[id]
    );
    return result.rows;
}

async function getMyName(id){
    const result = await db.query("SELECT * FROM users WHERE id = $1",[id]);
    return result.rows[0].first_name;
}
//Root page
app.get("/", async (req, res)=>{
    res.render("intro.ejs",{currentYear: year});
});

//contact page when not signed in
app.get("/contact", (req, res)=>{
    res.render("contact.ejs");
});

//about page when not signed in
app.get("/about", (req, res)=>{
    res.render("about.ejs");
});

//User's homepage after successfull sign in
app.get("/myaccount", async (req,res)=>{
    if(req.isAuthenticated()){
        const result = await getMyBooks(idUser);
        const myName = await getMyName(idUser);
        res.render("app.ejs",{myBooks:result, myName: myName});
    }else{
        res.redirect("/login");
    }
});

app.get("/signContact", (req, res)=>{
    if(req.isAuthenticated()){
        res.render("signContact.ejs");
    }else{
        res.redirect("/login");
    }
});

app.get("/signAbout", (req, res)=>{
    if(req.isAuthenticated()){
        res.render("signAbout.ejs");
    }else{
        res.redirect("/login");
    }
});

//Route to hit when user wants to add data in their account
app.get("/notes", async (req, res)=>{
    if(req.isAuthenticated()){
        res.render("notes.ejs");
    }else{
        res.redirect("/login");
    }
});

app.post("/notes", async (req,res)=>{
    if(req.isAuthenticated()){
        const isbn = req.body["book-isbn"];
        const name = req.body["book-title"];
        const author = req.body["book-author"];
        const notes = req.body["book-body"];
        const rating = req.body["book-rating"];
       
        const Id = await db.query("INSERT INTO books (title, author, isbn) VALUES ($1, $2, $3) RETURNING*",[name, author, isbn]);
        await db.query("INSERT INTO notes (body, rating, book_id, user_id) VALUES ($1, $2, $3, $4)",[notes, rating, Id.rows[0].id, idUser]);
        res.redirect("/myaccount"); 
    }else{
        res.redirect("/login");
    }

});

//Route to hit when user wants to edit the data in their account
app.get("/notes/:Id/edit", async (req,res)=>{
    if(req.isAuthenticated()){
        const idOfBook = req.params.Id;
        const result = await db.query(
            "SELECT * FROM notes JOIN books ON notes.book_id = books.id JOIN users ON notes.user_id = users.id WHERE book_id = $1",[idOfBook]
        );
    
        res.render("edit.ejs",{editBook:result.rows});
    }else{
        res.redirect("/login");
    }
    
});

app.post("/notes/:Id/edit", async (req,res)=>{
    if(req.isAuthenticated()){
        const idOfBook = req.params.Id;
        const isbn = req.body["book-isbn"];
        const name = req.body["book-title"];
        const author = req.body["book-author"];
        const notes = req.body["book-body"];
        const rating = req.body["book-rating"];
    
        await db.query("UPDATE books SET  title = ($1), author = ($2), isbn = ($3) WHERE id = $4", [name, author, isbn, idOfBook]);
        await db.query("UPDATE notes SET  body = ($1), rating = ($2) WHERE book_id = $3", [notes, rating, idOfBook]);

        res.redirect("/myaccount");
    }else{
        res.redirect("/login");
    }
    
});

//Route to hit when user wants to view the particular data in their account
app.get("/notes/:Id/views", async (req,res)=>{
    if(req.isAuthenticated()){
        const result = await db.query("SELECT * FROM books JOIN notes ON books.id = notes.book_id WHERE book_id = $1",[req.params.Id]);
        res.render("viewMyNotes.ejs",{myBooks:result.rows});
    }else{
        res.redirect("/login");
    }
    
});

//Route to hit when user wants to delete a particular data from their account
app.get("/notes/:Id/delete", async (req,res)=>{
    if(req.isAuthenticated()){
        //We have to first delete the foreing key then primary key
        await db.query("DELETE FROM notes WHERE book_id = $1",[req.params.Id]);
        await db.query("DELETE FROM books WHERE id = $1",[req.params.Id]);
        res.redirect("/myaccount");
    }else{
        res.redirect("/login");
    }


});

/********************************************************login and authentication Section****************************/
app.get("/login", (req,res)=>{
    res.render("login.ejs",{currentYear: year});
});

app.post("/login", passport.authenticate("local",{
    successRedirect: "/myaccount",
    failureRedirect:"/login",
})
);

app.get("/logout", (req, res) => {
    req.logout(function (err) {
      if (err) {
        return next(err);
      }
      res.redirect("/");
    });
  });

app.get("/register", (req,res)=>{
    res.render("register.ejs",{currentYear:year});
});

app.post("/register", async (req,res)=>{
    const name = req.body.name;
    const email = req.body.username;
    const password = req.body.password;
try {
    const check = await db.query("SELECT * FROM users WHERE user_name = $1",[email]);
    if(check.rows.length > 0){
        req.redirect("/login");
    }else{
        bcrypt.hash(password, saltRounds, async(err,hash)=>{
            if(err){
                console.log("Error hashing password:",err);
            }else{
               const result = await db.query("INSERT INTO users (first_name, user_name, password) VALUES ($1, $2, $3) RETURNING *",[name, email, hash]);
               const user = result.rows[0];
               idUser = user.id;
               req.login(user, (err)=>{
                console.log("success");
                res.redirect("/myaccount"); //page we want to load after successful registration
               });
            }
        });
    }
} catch (err) {
    console.log(err);
}
});

/************************************using passport-local to authenticate the user ****************************/
passport.use(new Strategy(async function verify(username, password, cb){
    try {
        const result = await db.query("SELECT * FROM users WHERE user_name = $1", [username]);
        if(result.rows.length > 0){
            const user = result.rows[0];
            const storedHashedPassword = user.password;
            idUser = user.id;
            bcrypt.compare(password, storedHashedPassword, (err, valid)=>{
                if(err){
                    console.log("Error comparing passwords:", err);
                    return cb(err);
                }else{
                    if(valid){
                        //Passed password check
                        return cb(null, user);
                    }else{
                        //Did not pass password check
                        return cb(null, false);
                    }
                }
            });
        }else{
            //User did not exist. Therefor need to register first.
            return cb("User not found");
        }
    } catch (err) {
        console.log(err);
    }
})
);

passport.serializeUser((user, cb)=>{
    cb(null, user);
});

passport.deserializeUser((user, cb)=>{
    cb(null, user);
});


/*****************************credentials change *********************/
app.get("/manageAccount", async(req,res)=>{
    if(req.isAuthenticated()){
        const result = await db.query("SELECT * FROM users WHERE id = $1",[req.user.id]);
        res.render("manageAccount.ejs",{credential : result.rows[0]});
    }else{
        res.redirect("/login");
    }
});

app.post("/manageName", async(req,res)=>{
    if(req.isAuthenticated()){
        const editName = req.body["edit-name"];
        const iD = req.body["updatedItemId"]
        await db.query("UPDATE users SET first_name = $1 WHERE id = $2",[editName,iD])
        res.redirect("/myaccount");
    }else{
        res.redirect("/login");
    }
    
});

app.post("/manageEmail", async(req,res)=>{
    if(req.isAuthenticated()){
        const editEmail = req.body["edit-email"];
        const iD = req.body["updatedItemId"];
        await db.query("UPDATE users SET user_name = $1 WHERE id = $2",[editEmail,iD])
        res.redirect("/myaccount");
    }else{
        res.redirect("/login");
    }
    
});

app.post("/managePassword", async(req,res)=>{
    if(req.isAuthenticated()){
        const newPassword = req.body["new-password"];
        const oldPassword = req.body["old-password"];
        const iD = req.body["updatedItemId"];
        const result = await db.query("SELECT * FROM users WHERE id = $1",[iD]);
        const storedHashedPassword = result.rows[0].password;
        bcrypt.compare(oldPassword, storedHashedPassword, (err, valid)=>{
            if(err){
            console.log("Error comparing passwords:", err);
            }else{
                if(valid){
                    //Passed password check
                    bcrypt.hash(newPassword, saltRounds, async(err,hash)=>{
                        if(err){
                            console.log("Error hashing new password:",err);
                        }else{
                            await db.query("UPDATE users SET password = $1 WHERE id = $2",[hash, iD]);
                            res.redirect("/myAccount");
                        }
                    });
                }else{
                    //Did not pass password check
                    res.send("password incorrect");
                }
        }
    });
    }else{
        res.redirect("/login");
    }
    
});

app.listen(port, ()=>{
    console.log(`Server running on port ${port}`);
});

