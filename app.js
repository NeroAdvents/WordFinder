const express = require('express');
const twig = require('twig');
const app = express();
const MongoClient = require('mongodb').MongoClient;
const mongoUrl = "mongodb://localhost:27017/";

app.set('view engine', 'twig');
app.set("view options", { layout: false });
app.set('twig', twig);
app.use(express.static('public'));


app.get('/', function (req, res) {
    let word = {};
    MongoClient.connect(mongoUrl, function (err, db) {
        if (err) {
            throw err;
        }
        let dbo = db.db("WordFinder");
        dbo.collection("WordFinderCollection").find({}).toArray(function (err, result) {
            if (err)
                throw err;
            word = result;
            db.close();
            // console.log(word);
            res.render("../index.html.twig", {words: JSON.stringify(word) });
        });
    });

    // res.sendFile(__dirname + '/index.html');

});

app.listen(3000, function () {
    console.log('Example app listening on port 3000!')
});