process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const request = require('supertest');

const HTTP_URL = 'http://nginx:80';
const HTTPS_URL = 'https://nginx:443';

describe('testing reverse proxy', () => {

  test('redirect from 80 to 443', async () => {

    const response = await request(HTTP_URL)
      .get('/')
      .redirects(0)
      .timeout(2000);

    expect(response.status).toBe(301);
    expect(response.headers['location']).toBeDefined();
    expect(response.headers['location']).toMatch(/^https:\/\//);
  });

  test('get request to https', async () => {

    const response = await request(HTTPS_URL)
      .get('/')
      .redirects(0)
      .timeout(2000);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.text).toMatch(/<!doctype html>/i);

  });

});
