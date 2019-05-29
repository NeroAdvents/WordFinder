const puppeteer = require('puppeteer');
const MongoClient = require('mongodb').MongoClient;
const mongoUrl = "mongodb://localhost:27017/";
const webWords = "http://www.textfixerfr.com/outils/generateur-de-mots-aleatoires.php";
const webSynonymous = "http://www.synonymes.com/";

/**
 * Used when the scrapper needs to wait while a task is running)
 * @param time
 * @returns {Promise<any>}
 */
function delay(time) {
    return new Promise(function(resolve) {
        setTimeout(resolve, time);
    });
}

/**
 * Allows the scrapper to click on ui elements
 * @param page
 * @param selector
 * @returns {Promise<any>}
 */
let click = (page, selector) => {
    return new Promise(async(resolve, reject) => {
        try {
            await page.focus(selector);
            await page.click(selector);
        } catch (e) {
            console.log("Trouble with click event");
            reject(e);
        }
        resolve(true);
    });
};

/**
 * Allows the scrapper to write on input fields
 * @param page
 * @param selector
 * @param text
 * @returns {Promise<any>}
 */
let waitAndType = (page, selector, text) => {
    return new Promise(async(resolve, reject) => {
        try {
            await page.waitFor(selector);
            await page.type(selector, text);
        } catch (e) {
            reject(e);
        }
        resolve(true);
    });
};

let scrapWords = async() => {
    const browser = await puppeteer.launch({headless: false, defaultViewport: {width: 900, height: 1080}});
    const page = await browser.newPage();


    try {
        await page.goto(webWords);
    } catch (e) {
        console.log("Scrapper " + e);
        await browser.close();
        throw e;
    }

    let words = [];

    for (let i = 0 ; i < 40 ; i++) {
        const allWords = await page.$$("#wordList span");

        for (let k = 0; k < allWords.length; k++) {
            let word = await page.evaluate(span => span.innerText, allWords[k]);

            words.push(word);
        }
        await click(page, "#random-words");
    }

    await stripWords(words);
    await scrapSynonymous(browser, page, words);

    await browser.close();
};

let stripWords = async(words) => {

    let wordsDB = [];

    await new Promise(function(resolve) {
        MongoClient.connect(mongoUrl, function (err, db) {
            if (err) {
                throw err;
            }
            let dbo = db.db("WordFinder");
            dbo.collection("WordFinderCollection").find({}).toArray(function (err, res) {
                if (err)
                    throw err;
                wordsDB = res;
                db.close();
                resolve(true);
            });
        });
    });
    // checker si doublons ou non
    for (let i = 0 ; i < words.length ; i++) {
        for (let k = 0 ; k < words.length ; k++) {
            if (k !== i && words[i] == words[k]) {
                words.splice(i--, 1);
                break;
            }
        }
    }
    // checker les conditions "pas de mots composé" "pas + 10 char"
    for (let i = 0 ; i < words.length ; i++) {
        console.log("I = " + i);
        if (words[i].indexOf('-') !== -1 || words[i].indexOf(' ') !== -1 || words[i].length > 10) {
            console.log(words[i]);
            words.splice(i--, 1);
            continue;
        }
        for (let k = 0 ; k < wordsDB ; k++) {
            if (words[i] === wordsDB[k]) {
                words.splice(i--, 1);
                break;
            }
        }
    }
};

let scrapSynonymous = async(browser, page, words) => {
    try {
        await page.goto(webSynonymous);
    } catch (e) {
        console.log("Scrapper " + e);
        await browser.close();
        throw e;
    }

    let synonymous = {};

    for (let i = 0 ; i < words.length ; i++) {
        await waitAndType(page, ".searchtxt", words[i]);
        await click(page, ".searchsubmit");
        await delay(200);

        let adj;

        try {
            adj = await page.$(".defbox span");
        } catch (e) {
            continue;
        }

        if (!adj)
            continue;

        const check = await page.evaluate(span => span.innerText, adj);

        if (!check || (check !== 'Adjectif' && check !== 'Nom'))
            continue;

        let syns = await page.$$(".defbox:first-child li");

        if (!syns || syns.length === 0)
            syns = await page.$$(".defbox ol li a");

        let allSyns = [];

        try {
            allSyns[0] = await page.evaluate(a => a.innerText, syns[0]);
            allSyns[1] = await page.evaluate(a => a.innerText, syns[1]);
            allSyns[2] = await page.evaluate(a => a.innerText, syns[2]);
        } catch(e) {
            continue;
        }

        if (!allSyns[0] || !allSyns[1] || !allSyns[2])
            continue;

        synonymous[words[i]] = [
            allSyns[0],
            allSyns[1],
            allSyns[2]
        ]
    }

    let objs = []; // strip format in db

    for (let i = 0 ; i < words.length ; i++) {
        if (!synonymous[words[i]])
            continue;
        objs.push({
            word_name: words[i],
            synonymous: synonymous[words[i]]
        });
    }

    MongoClient.connect(mongoUrl, function(err, db) {
        if (err) {
            throw err;
        }
        const dbo = db.db("WordFinder");

        dbo.collection("WordFinderCollection").insertMany(objs, function(err, res) {
            if (err)
                throw err;
            db.close();
        });
    });
};

let main = async() => {
    try {
        await scrapWords();
    } catch (e) {
        throw e;
    }
};

main();