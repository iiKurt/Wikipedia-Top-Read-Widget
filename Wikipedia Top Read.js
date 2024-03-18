// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: brown; icon-glyph: bookmark;

// Useful links
// https://en.wikipedia.org/api/rest_v1/#/Feed/aggregatedFeed
// https://design.wikimedia.org/blog/2021/04/26/bringing-wikipedia-to-the-homescreen-on-ios.html
// https://design.wikimedia.org/blog/assets/uploads/wikipedia-widget/wikipedia-top-read-widget.png

const PREFS = {
  // Number of articles to show when running in app
  // API only returns about 50 articles I think
  maximumArticles: 25,
  // Whether to show the app view in fullscreen or not
  fullscreen: false,
  
  // Is automatically determined based on widget size
  // Set to 4 when running script directly in debug mode
  maximumWidgetArticles: 4,
  
  background: Color.dynamic(new Color("#FFF"), new Color("#000")),

  foregroundPrimary: Color.dynamic(new Color("#00"), new Color("#FF")),
  foregroundSecondary: Color.dynamic(new Color("#8A898D"), new Color("#8E8D93")),
  foregroundTertiary: Color.dynamic(new Color("#EEE"), new Color("#222")),
  
  statsBackground: Color.dynamic(new Color("#F8F7F9"), new Color("#1F1F1F")),
  statsLines: Color.dynamic(new Color("#EBEBEB"), new Color("#373737")),
  statsForeground: Color.dynamic(new Color("#4DAA8C"), new Color("#4DAA8C")),

  // Not actually used at the moment
  font: {
    name: "San Francisco",
    size: 16,
  },

  rankColors: [
    new Color("#3F64C7"),
    new Color("#3E75B5"),
    new Color("#4188A7"),
    new Color("#479B99")
    ],
  
  debugMode: false
}


/**
* widgetParameters is the string passed
* trough "Parameter" when setting up a widget
* Here we use it as a language selector
* and fall back to en if not set.
* 
* List of all wikipedias subdomains
* https://gist.github.com/fr0r/869cf5d3266df689b6e9c3514991baf6
**/
let lang = args.widgetParameter || "en"

/**
* queryParameters is all args passed when running
* the script trough an URLScheme, eg scriptable:///run/scriptName?lang=fr
* */
if (args.queryParameters.lang != undefined) {
  lang = args.queryParameters.lang
}

/**
* Sanitizing lang args, in case in contains erroneous
* caracters such as space.
* */
lang = lang.trim();

/**
* Multi language dictionary
* */
function getDictionary(language) {
    const text = {
        en: {
            topRead: 'Top read'
        },
        fr: {
            topRead: 'Les plus lus'
        }
    };
    return [Object.keys(text), text[language]];
}

const supportedLanguages = getDictionary(lang)[0];
if (!(supportedLanguages.includes(lang))) {
    console.log("Language Error: Language not found, defaulting to English.")
    lang = "en";
};
const dictionary = getDictionary(lang)[1];


// Preview widget
if (PREFS.debugMode) {
  let widget = await createWidget();
  await widget.presentLarge();
}
// Running in widget
else if (config.runsInWidget) {
  let widget = await createWidget();
  Script.setWidget(widget);
}
// Not running in widget/being run directly
else {
  let app = await createApp();
  await QuickLook.present(app, PREFS.fullscreen);
}

Script.complete();

async function createApp() {
  let topRead = await getTopRead(PREFS.maximumArticles);

  const table = new UITable()
  for (let index = 0; index < topRead.length; index++) {
    let article = await topRead[index];

    let row = new UITableRow();
    
    let rankCell = row.addText("" + (index + 1));
    rankCell.titleFont = Font.boldSystemFont(16);
    let textCell = row.addText(article.normalizedtitle, article.description);
    textCell.subtitleColor = PREFS.foregroundSecondary;
    let viewsCell = row.addText(formatNumber(article.views));
    viewsCell.titleFont = Font.footnote();
    viewsCell.titleColor = PREFS.statsForeground;
    let imageCell = row.addImageAtURL(article.thumbnail?.source);

    rankCell.widthWeight = 10;
    textCell.widthWeight = 100;
    viewsCell.widthWeight = 20;
    imageCell.widthWeight = 10;

    row.height = 60;
    row.cellSpacing = 10;
    row.onSelect = () => {
      Safari.open(article.content_urls.desktop.page);
    }
    row.dismissOnSelect = false;
    table.addRow(row);
  }
  return table
}

async function createWidget() {
  let widget = new ListWidget();
  
  let nextRefresh = Date.now() + 1000*60*60*8; // 8 hours
  widget.refreshAfterDate = new Date(nextRefresh);

  // Light color first, dark color second
  widget.backgroundColor = PREFS.background;
  widget.setPadding(15, 15, 0, 15);
  // (top, leading, bottom, trailing)

  const topReadString = widget.addText(dictionary.topRead);
  topReadString.font = Font.boldSystemFont(18);
  topReadString.textColor = PREFS.foregroundPrimary;

  // widget.addSpacer();
  const listStack = widget.addStack();
  listStack.layoutVertically();
  listStack.setPadding(7.5, 0, 0, 0);
  
  // Determine how many articles to show
  if (config.widgetFamily == "small") {
    PREFS.maximumWidgetArticles = 1;
  }
  else if (config.widgetFamily == "medium") {
    PREFS.maximumWidgetArticles = 2;
  }
  else if (config.widgetFamily == "large") {
    PREFS.maximumWidgetArticles = 4;
  }
  
  // Create the article list
  let topRead = await getTopRead(PREFS.maximumWidgetArticles);
  for (let index = 0; index < topRead.length; index++) {
    let article = topRead[index];
    await listItem(
      listStack,
      index + 1,
      article.normalizedtitle,
      article.description,
      article.content_urls.desktop.page,
      article.views,
      await loadThumbnail(article.thumbnail?.source),
      config.widgetFamily
      );
  };
  
  // Small widgets only support one tap target - set it to the top article's URL
  // For bigger widgets, all click on either "Top reads" or blank space will
  // Open an UITable of the Top reads limited to PREFS.maximumArticles articles.
  if (config.widgetFamily == "small") {
    widget.url = topRead[0].content_urls.desktop.page;
  } else {
    widget.url = "scriptable:///run/" + Script.name() + "?lang="+lang;
  }

  // await listItem(listStack, 1, "Octavia E. Butler", "American science fiction writer", 10000, "https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Mexico_City_New_Years_2013%21_%288333128248%29.jpg/320px-Mexico_City_New_Years_2013%21_%288333128248%29.jpg");
  // await listItem(listStack, 2, "Octavia E. Butler");
  // await listItem(listStack, 3, "Octavia E. Butler");
  // await listItem(listStack, 4, "Octavia E. Butler");

  widget.addSpacer();

  return widget;
}

async function listItem(listStack, rank, title, description = "Some description", url, views = 0, thumbnail = undefined, size = "large") {
  // Item
  const itemStack = listStack.addStack();
  itemStack.layoutHorizontally();
  itemStack.centerAlignContent();
  itemStack.url = url;
  
  // fixes the spacing so all the items aren't at the top when there isn't much content
  listStack.addSpacer();
  
  // Ranking
  if (size != "small") {  
    let colorIndex = rank;
    let scaling = PREFS.rankColors.length/PREFS.maximumWidgetArticles;
    colorIndex *= scaling;
    colorIndex -= 1;
    
    const rankSymbol = SFSymbol.named(rank + ".circle");
    rankSymbol.applyFont(Font.thinSystemFont(24))
    const rankImage = rankSymbol.image;
    const rankWidgetImage = itemStack.addImage(rankImage);
    rankWidgetImage.tintColor = PREFS.rankColors[colorIndex];
    rankWidgetImage.resizable = false;
  }
  
  // Title and description
  const infoStack = itemStack.addStack();
  infoStack.layoutVertically();
  if (size == "small") {
    infoStack.setPadding(4, 0, 4, 0);
  }
  else {
    infoStack.setPadding(4, 15, 4, 0);
  }
  infoStack.spacing = 4;
  
  // Title
  const itemTitle = infoStack.addText(title);
  itemTitle.font = Font.semiboldSystemFont(16);
  itemTitle.textColor = PREFS.foregroundPrimary;
  
  // Description
  const itemDescription = infoStack.addText(description);
  itemDescription.font = Font.regularSystemFont(14);
  itemDescription.textColor = PREFS.foregroundSecondary;

  // View count
  if (size != "medium") {  
    const statsStack = infoStack.addStack();
    statsStack.backgroundColor = PREFS.statsBackground;
    statsStack.cornerRadius = 4;
    statsStack.size = new Size(0, 18);
    statsStack.centerAlignContent();
    statsStack.setPadding(4, 4, 4, 4);
    // Graph would go here...
    //statsStack.addSpacer(32);
    
    const itemViews = statsStack.addText(formatNumber(views) + "");
    itemViews.font = Font.regularSystemFont(12);
    itemViews.textColor = PREFS.statsForeground;
  }

  // Thumbnail image
  if (size != "small") {  
    itemStack.addSpacer();
    
    let spacing = 60;
    if (size == "large") {
      spacing = 60;
    }
    else if (size == "medium") {
      spacing = 40;
    }
    
    // Some articles don't have a thumbnail provided
    if (thumbnail === undefined) {
      // Empty spot where thumbnail would usually be
      //itemStack.addSpacer(spacing);
      // SFSymbol.named("square.slash").image
      const missingThumbnailStack = itemStack.addStack();
      missingThumbnailStack.backgroundColor = PREFS.foregroundTertiary;
      missingThumbnailStack.cornerRadius = 8;
      missingThumbnailStack.size = new Size(spacing, spacing);
    }
    else {
      const thumbnailImage = itemStack.addImage(thumbnail);
      thumbnailImage.cornerRadius = 8;
      thumbnailImage.applyFillingContentMode();
      thumbnailImage.imageSize = new Size(spacing, spacing);
    } 
  }
}

async function loadThumbnail(url) {
  if (url === undefined) {
    return undefined;
  }
  let request = new Request(url);
  return request.loadImage();
}

async function getTopRead(maximum) {
  const apiUrl = 'https://' + lang + '.wikipedia.org/api/rest_v1/feed/featured/';

  // Get current UTC date
  const currentDate = new Date().toISOString().split('T')[0].replace(/-/g, '/');

  // Append the current date to the API URL
  const fullApiUrl = `${apiUrl}${currentDate}`;

  const request = new Request(fullApiUrl);
  const response = await request.loadJSON(fullApiUrl)
  
  const articles = response.mostread.articles;

  // Sort articles by views in descending order
  articles.sort((a, b) => b.views - a.views);

  // Get the top articles up until maximum
  const topArticles = articles.slice(0, maximum);
  return topArticles;
}

function formatNumber(n) {
  const ranges = [  
    { divider: 1e6 , suffix: 'M' },
    { divider: 1e3 , suffix: 'k' }
    ];

  for (let i = 0; i < ranges.length; i++) {
    if (n >= ranges[i].divider) {
      n = (n / ranges[i].divider);
      n = Math.round(n * 10) / 10;
      return n.toString() + ranges[i].suffix;
    }
  }
  return n.toString();
}