const pupHelper = require('./puppeteerhelper');
const pLimit = require('p-limit');
const path = require('path');
const moment = require('moment');
const fs = require('fs');
const filePath = path.resolve(__dirname, `${moment().format('MM-DD-YYYY HH-mm')}.csv`);
const {siteLink, singleAttorneyUrl, knownBarNo, barNoMax, SOCKS_USER, SOCKS_PORT, SOCKS_PASSWORD, SOCKS_HOST, concurrency} = require('./keys');
let browser;

const run = async () => {
  try {
    console.log('Stated Scraping...');
    browser = await pupHelper.launchBrowser();

    const promises = [];
    const limit = pLimit(concurrency);

    for (let attorneyNumber = knownBarNo; attorneyNumber > 0; attorneyNumber--) {
      promises.push(limit(() => fetch(attorneyNumber)));
    }

    await Promise.all(promises);
  
    await browser.close();
    console.log('Finished Scraping...');

    return;
  } catch (error) {
    console.log(error);
    return error;
  }
}

const fetch = (attorneyNumber) => new Promise(async (resolve, reject) => {
  let page;
  try {
    console.log(`Fetching Details for Attorney Number: ${attorneyNumber}`);
    const result = {};
    const pageUrl = siteLink + pad(attorneyNumber, 6);
    page = await pupHelper.launchPage(browser);
    await page.goto(pageUrl, {timeout: 0, waitUntil: 'load'});
    await page.waitForSelector('#moduleMemberDetail > div:nth-of-type(2) > p');

    result.status = await getCellValue(page, 'license status:');
    if (result.status == '') {
      result.status = 'Deceased';
    }

    if (result.status.toLowerCase() == 'active') {
      await page.waitForSelector('#moduleMemberDetail > h3:nth-of-type(2)');

      result.barNumber = attorneyNumber;
      result.name = await pupHelper.getTxt('#moduleMemberDetail > h3:nth-of-type(2)', page);
      if (/^.*(?=#)/gi.test(result.name)) result.name = result.name.match(/^.*(?=#)/gi)[0].trim();
      result.county = await getCellValue(page, 'county:');
      result.phoneNumber = await getCellValue(page, 'phone number:');
      result.faxNumber = await getCellValue(page, 'fax number:');
      result.email = await getCellValue(page, 'email:');
      result.lawSchool = await getCellValue(page, 'law school:');
      result.statusAndHistory = await pupHelper.getTxt('#moduleMemberDetail > div.margin-bottom > table > tbody', page);
      result.statusAndHistory = result.statusAndHistory.replace(/"/gi, "'");
      await saveToCsv(result);
    }

    console.log(`${attorneyNumber} - Status - ${result.status}`);
    await page.close();
    resolve(true);
  } catch (error) {
    if (page) await page.close();
    console.log(`fetch [${attorneyNumber}] Error: ${error}`);
    resolve(error);
  }
});

const getCellValue = (page, label) => new Promise(async (resolve, reject) => {
  try {
    let returnVal = '';
    const props = await pupHelper.getTxtMultiple('#moduleMemberDetail > div:nth-of-type(2) > p', page);
    
    for (let i = 0; i < props.length; i++) {
      if (props[i].toLowerCase().startsWith(label.toLowerCase())) {
        const regex = new RegExp(label, 'gi');
        returnVal = props[i].replace(regex, '').trim();
        break;
      }
    }

    resolve(returnVal);
  } catch (error) {
    console.log(`getCellValue [${label}] Error: `, error);
    reject(error);
  }
});

const saveToCsv = (result) => new Promise(async (resolve, reject) => {
  try {
    if (!fs.existsSync(filePath)) {
      const csvHeader = '"Bar Number","Status","Name","County","Phone Number","Fax Number","Email","Law School","License Status, Disciplinary and Administrative History"\r\n';
      fs.writeFileSync(filePath, csvHeader);
    }

    const csvLine = `"${result.barNumber}","${result.status}","${result.name}","${result.county}","${result.phoneNumber}","${result.faxNumber}","${result.email}","${result.lawSchool}","${result.statusAndHistory}"\r\n`;
    fs.appendFileSync(filePath, csvLine);

    resolve(true);
  } catch (error) {
    console.log('saveToCsv Error: ', error);
    reject(error);
  }
});

function pad(num, size) {
  var s = num + "";
  while (s.length < size) s = "0" + s;
  return s;
};

run();
