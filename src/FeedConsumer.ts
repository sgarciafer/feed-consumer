declare var require: any

import { promisify } from 'util'
import { sign, ClaimBuilder, Claim, ClaimTypes, ClaimAttributes, ProfileAttributes, hex } from 'poet-js'
import * as child_process from 'child_process'
import * as fetch from 'isomorphic-fetch'
import * as xml2js from 'xml2js'
import * as moment from 'moment'

const bitcore = require('bitcore-lib')
const parseString = promisify(xml2js.parseString)

export type FeedEntries = (parsedFeed: any) => any

export interface Feed {
  url: string
  privateKey: string
  feedEntries: FeedEntries
  fields: FeedFields
  profile: ProfileAttributes
}

export interface FeedFields {
  [key: string]: string | ((article: any) => (string | Promise<string>))
}

interface Article extends ClaimAttributes {

}

export class FeedConsumer {
  private readonly poetUrl: string
  private readonly feedUrl: string
  private readonly feedPrivateKey: string
  private readonly feedPublicKey: string
  private readonly feedFields: FeedFields
  private readonly feedEntries: FeedEntries
  private readonly profile: ProfileAttributes

  constructor(poetUrl: string, configuration: Feed) {
    this.poetUrl = poetUrl
    this.feedUrl = configuration.url
    this.feedEntries = configuration.feedEntries
    this.feedFields = configuration.fields
    this.profile = configuration.profile
    this.feedPrivateKey = configuration.privateKey

    const feedPrivateKeyBitcore = bitcore.PrivateKey(configuration.privateKey)
    this.feedPublicKey = feedPrivateKeyBitcore.publicKey.toString()
  }

  public async consume() {
    console.log('Running Poet Feed Consumer for ' + this.profile.displayName)
    console.log()
    console.log(moment().format('YYYY MMMM Do, hh:mm:ss a'))
    console.log()
    console.log('Poet API URL:', this.poetUrl)
    console.log('Feed URL:', this.feedUrl)
    console.log('Feed Public Key:', this.feedPublicKey)
    console.log()

    child_process.execSync("sleep 2")

    console.log('Posting Profile...')
    await this.postProfile()
    console.log('Profile posted.')
    console.log()
    console.log('Scanning Feed...')

    try {
      await this.scanFeedEntries()
    } catch (err) {
      console.error('Uncaught error scanning feed', err, err.stack)
    }
    console.log('Finished.')
    console.log()
  }

  private async postProfile() {
    const data: Claim<ProfileAttributes> = {
      type: ClaimTypes.PROFILE,
      publicKey: this.feedPublicKey,
      attributes: this.profile
    }
    const message = ClaimBuilder.getEncodedForSigning(data)
    const id = ClaimBuilder.getId(data)
    const signature = sign(this.feedPrivateKey, id)
    return await this.postClaims([{
      message: hex(message),
      signature: hex(signature)
    }])
  }

  private async scanFeedEntries(): Promise<any> {
    const feed = await fetch(this.feedUrl)
      .then(_ => _.text())
      .catch(err => {
        console.log('An error occurred when fetching the feeds.')
        console.error(err);
        throw new Error('An error occurred when fetching the feeds')
      })

    const parsedFeed = await parseString(feed, { strict: false })
    const feedEntries = await this.getFeedEntries(parsedFeed)
    console.log(`The feed has ${feedEntries.length} articles.`)
    console.log(`Checking which articles are new...`)
    const newArticles = await this.filterNewArticles(feedEntries)

    if (!newArticles.length) {
      console.log('No new articles found.')
      return
    }

    console.log(`Found ${newArticles.length} new articles.`)
    console.log()

    child_process.execSync("sleep 2")

    console.log('Submitting articles...')
    console.log()

    for (const article of newArticles)
      console.log(article.link || article.name)

    console.log()
    const submittedArticles = (await this.submitArticles(newArticles)) as any
    console.log('Articles submitted.')
    console.log()

    child_process.execSync("sleep 2")

    console.log('Submitting licenses')

    try {
      await this.submitLicenses(submittedArticles)
    } catch (err) {
      console.error('Uncaught error submitting licenses', err, err.stack)
      throw new Error('Unexpected error submitting licenses')
    }

    console.log('Licenses submitted.')
    console.log()
  }

  private async getFeedEntries(parsedFeed: any): Promise<Article[]> {
    const feedEntries = this.feedEntries(parsedFeed)

    const items = feedEntries instanceof Promise
      ? await feedEntries
      : feedEntries

    return Promise.all(items.map(this.processFeedEntry.bind(this)) as any[])
  }

  private async processFeedEntry(article: any): Promise<Article> {
    const item: any = {}

    for (let [key, valueOrFunction] of Object.entries(this.feedFields)) {
      if (typeof valueOrFunction === 'string') {
        item[key] = valueOrFunction
      } else {
        const value = valueOrFunction(article)

        item[key] = value instanceof Promise
          ? await value
          : value
      }
    }

    return item
  }

  private async filterNewArticles(articles: Article[]): Promise<Article[]> {
    const articlesExistence = await Promise.all(articles.map(this.isTimestamped.bind(this)))
    return articles.filter((article: Article, index: number) => !articlesExistence[index])
  }

  private isTimestamped(article: Article): Promise<boolean> {
    return fetch(`${this.poetUrl}/explorer/works?attribute=id<>${article.id}&owner=${this.feedPublicKey}`)
      .then(res => res.json())
      .then(res => (res as any).length !== 0)
  }

  private async submitArticles(articles: Article[]) {
    const signedClaims = articles.map(article => {
      const data: Claim<Article> = {
        type: ClaimTypes.WORK,
        publicKey: this.feedPublicKey,
        attributes: article
      }
      const message = ClaimBuilder.getEncodedForSigning(data)
      const id = ClaimBuilder.getId(data)
      const signature = sign(this.feedPrivateKey, id)
      return {
        message: hex(message),
        signature: hex(signature)
      }
    })
    return await this.postClaims(signedClaims)
  }

  private async submitLicenses(articles: any[]) {
    const signedClaims = articles.map(article => {
      const claim: Claim<ClaimAttributes> = {
        type: ClaimTypes.LICENSE,
        publicKey: this.feedPublicKey,
        attributes: {
          reference: article.id,
          licenseHolder: this.feedPublicKey,
          licenseEmitter: this.feedPublicKey,
          referenceOwner: this.feedPublicKey,
          proofType: 'LicenseOwner',
        }
      }
      const message = ClaimBuilder.getEncodedForSigning(claim)
      const id = ClaimBuilder.getId(claim)
      const signature = sign(this.feedPrivateKey, id)
      return {
        message: hex(message),
        signature: hex(signature)
      }
    })

    console.debug('Starting submitLicenses.postClaims...')
    return await this.postClaims(signedClaims)
  }

  private async postClaims(claims: any) {
    console.debug('Starting postClaims...')
    const result = await fetch(`${this.poetUrl}/user/claims`, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain'
      },
      body: JSON.stringify({ signatures: claims })
    })
    console.debug('Finished postClaims...')

    if (!result.ok) {
      console.error('Error posting claims. Server responded:')
      console.error(await result.text())
      // TODO: this won't stop the rest of the script from running! Need to throw new ServerError(await result.text)) instead
      return
    }

    const json = await result.json()

    if (!json.createdClaims) {
      throw new Error('Unexpected Po.et API response: ' + JSON.stringify(json, null, 2))
    }

    return json.createdClaims.filter((e: any) => e.type === 'Work')

  }

}