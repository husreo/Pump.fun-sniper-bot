import axios from 'axios';

export async function findData(data: any, field: string): Promise<any | null> {
  if (typeof data === 'object') {
    if (field in data) {
      return data[field];
    } else {
      for (const value of Object.values(data)) {
        const result = await findData(value, field);
        if (result !== null) {
          return result;
        }
      }
    }
  } else if (Array.isArray(data)) {
    for (const item of data) {
      const result = await findData(item, field);
      if (result !== null) {
        return result;
      }
    }
  }
  return null;
}

export async function getCoinData(mintStr: string): Promise<any | null> {
  try {
    const url = `https://client-api-2-74b1891ee9f9.herokuapp.com/coins/${mintStr}`;

    const response = await axios.get(url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "If-None-Match": 'W/"3ed-Ffr6ltniG0cErR/DPuN9vQlNph8"'
        }
      }
    );

    return response.status === 200 || response.status === 304 ? response.data : null;
  } catch (e) {
    console.error(e);
    return null;
  }
}
