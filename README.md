# Poet Feed Consumer
Automatically post articles from an XML feed to [Poet](https://po.et)

## How to Use

Poet's Feed Consumer is very easy to use. You just create an instance of FeedConsumer, passing Po.et API's url and an object with the feed's configuration.

```js
const feedConsumer = new FeedConsumer('https://alpha.po.et/api', configuration)
feedConsumer.consume()
```

The first parameter is the url of Po.et's API. You most likely want it to be `https://alpha.po.et/api` right now. 
You can also use something like `http://localhost:1000` if you're running a Po.et Node in your machine.

The second parameter is a configuration object. It should look like this:

```js
{
  url: 'https://bitcoinmagazine.com/feed/',
  privateKey: '(private key of your profile)',
  feedEntries: getFeedEntries,
  fields: {
    id: getId,
    link: getLink,
    content: getContent,
    author: getAuthor,
    tags: getTags,
    name: getTitle,
    datePublished: getPublicationDate,
    mediaType: 'article',
    articleType: 'news-article',
  },
  profile: {
    name: "BTC Media",
    displayName: "BTC Media",
    imageData: fs.readFileSync(__dirname + '/bitcoin-magazine.urlimage').toString()
  }
}
```

#### Configuration

##### url
The url of the feed you want to import into Po.et

##### privateKey
The private key used to sign the claims. The corresponding public key is the one that identifies your profile.

Po.et's Feed Consumer uses [bitcore-lib](https://www.npmjs.com/package/bitcore-lib) `PrivateKey(privateKeyString).publicKey.toString()` to obtain the corresponding public key.

More on how to generate a private key later in this document. 

##### feedEntries
A function that receives the parsed feed and returns either a node of the parsed xml tree or a promise that resolves to a node of the xml tree. This node must be an array of articles, also called feed entries.

Po.et's Feed Consumer uses [xml2js](https://www.npmjs.com/package/xml2js) to parse the XML feed. The value passed to `feedEntries` is actually the result of calling `xml2js.parseString` on the entire feed.

##### fields
An object that maps field names to values. The keys of this object will be passed to Po.et as attributes of the published work. The values can be any of the following:
- A string
- A function that receives a feed's entry and returns a string
- A function that receives a feed's entry and returns a Promise\<string\>

Some constraints on the fields:
- `id` is used to check whether the article has already been posted. This field is mandatory and must be unique per feed entry, otherwise the same article will wind up being posted every time `consume()` is ran.
- `name`: the title of the article being published.
- `link` will be displayed as an actual link in the future, which will lead to better SEO for your publication.
- `content`: the actual text of the feed entry.
- `author`: either a plain text value, such as the name of the author, or the id of a poet profile. If a profile id is provided, the frontend will load the display name from it and render it as a link to the profile.
- `mediaType`: must be `article` for now. Other media types such as `image`, `video` or `song` will be supported in the future.
- `articleType`: must be `news-article`. More article types will be supported in the future.

You can also add your own, custom fields. You can provide as many as you wish.

##### profile
Attributes for the profile that will own the published works from the feed. 
- `ìmageData` is the profile picture and must the a base64-encoded image.
- `name` is usually a human name (first name + last name).
- `displayName` is usually a human name, organization name or pseudonym.


### How to Generate a Private Key

A private key is just a large integer number, but must be chosen carefully to be secure.
 
One possible process to generate this value is:

#### 12 Word Mnemonic

We'll use Ian Coleman's app to do this. 

- Visit https://iancoleman.github.io/bip39/
- Choose `12` from the dropdown and click `Generate`
- Select the `BTC - Bitcoin Testnet` in `Coin`
- Copy the `BIP32 Root Key`. It should start with `tprv`

#### Private Key

We'll use Bitcore's HD Keys for this.

- Go to https://bitcore.io/playground/#/hdkeys
- Paste the BIP32 Root key in `Root HD Private Key`
- Expand the  `Path: m` panel
- The `Private Key` is what you're looking for

For more information, WeTrust has published an excellent article on this topic: [Why Do I Need a Public and Private Key on the Blockchain?](https://blog.wetrust.io/why-do-i-need-a-public-and-private-key-on-the-blockchain-c2ea74a69e76).