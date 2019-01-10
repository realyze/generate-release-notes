import simpleGit, { SimpleGit } from 'simple-git/promise';
import github from 'octonode';
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import moment from 'moment';
import _ from 'lodash';

type GithubPR = {
  number: number;
  title: string;
  created_at: string;
  updated_at: string;
  closed_at: string;
  user: {
    login: string;
  };
};

const CONFIG_KEY_ORG_REPO = 'canvaboy.orgRepo';
const CONFIG_KEY_GH_API_KEY = 'github.apiKey';
const CONFIG_KEY_USER_NAME = 'user.name';

async function getOrgAndRepo(sg: simpleGit.SimpleGit): Promise<string> {
  const orgAndRepo = await sg.raw(['config', '--get', '--global', CONFIG_KEY_ORG_REPO]);
  return (orgAndRepo || 'Canva/canva').trim();
}

/**
 * Initializes and returns octnode (GitHub API) client and SimpleGit (git) client.
 */
async function getGithubClient() {
  const sg = simpleGit();
  let key = await sg.raw(['config', '--get', '--global', CONFIG_KEY_GH_API_KEY]);
  if (!key) {
    try {
      key = fs.readFileSync(path.join(`${process.env.HOME}`, '.pr-train'), 'utf-8');
    } catch {
      const title = 'GitHub API Key not found';
      console.log(
        `Please run "git config --global ${CONFIG_KEY_GH_API_KEY} <Your GH API key>" ` +
        `to enable Canva Boy to access your pull requests data.`
      );
      process.exit(1);
    }
  }
  const client = github.client(key.trim());
  return {
    sg,
    client,
  };
}

async function getGitUserName(sg: SimpleGit) {
  return (await sg.raw(['config', '--get', '--global', CONFIG_KEY_USER_NAME])).trim();
}

async function getGithubNick(client: any) {
  const myGithubInfo = (await client.me().infoAsync())[0];
  return myGithubInfo.login;
}

async function main() {
  const {sg, client} = await getGithubClient();
  const githubNick = await getGithubNick(client);
  console.log('GitHub nick:', githubNick);

  const orgAndRepo = await getOrgAndRepo(sg);
  const ghsearch = client.search();

  const results: [{ items: GithubPR[] }] = await ghsearch.issuesAsync({
    q: `repo:${orgAndRepo}+type:pr+is:merged+author:${githubNick}`,
    sort: 'updated',
    order: 'desc',
  });
  const userName = await getGitUserName(sg);
  const releaseNotesChoices = _.sortBy(results[0].items, pr => pr.closed_at)
    .reverse()
    .map(pr => ({
      value: `${pr.title.trim()} (#${pr.number})`,
      name: `${pr.title.trim()} (#${pr.number}) closed: ${moment(pr.closed_at).fromNow()}`
    }));
  const promptResponse = await inquirer.prompt<{releaseNotes: string[]}>({
    type: 'checkbox',
    choices: releaseNotesChoices,
    name: 'releaseNotes',
    pageSize: 100,
  });
  const selectedNotes = promptResponse.releaseNotes.map(line => `${userName}: ${line}`).join('\n')
  console.log(selectedNotes);
}

main();
