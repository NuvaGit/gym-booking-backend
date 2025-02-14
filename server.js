const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/book", async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ success: false, message: "Username is required!" });
  }

  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto("https://hub.ucd.ie/usis/W_HU_MENU.P_PUBLISH?p_tag=GYMBOOK");

    console.log("🔄 Checking for available slots...");

    // Insert Puppeteer logic to click on a gym booking slot here...

    await browser.close();
    res.json({ success: true, message: "🎉 Booking Confirmed!" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, message: "❌ Booking failed." });
  }
});

app.listen(5000, () => console.log("🚀 Backend running on port 5000"));
