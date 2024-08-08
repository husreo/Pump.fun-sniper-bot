import axios from 'axios';
import fs from 'fs'


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
    console.error("");
    return null;
  }
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// Function to save data to JSON file
export const saveDataToFile = (data: any, filePath: string = "data.json") => {
  try {
    // Convert data to JSON format
    const jsonData = JSON.stringify(data);

    // Write JSON data to file
    fs.writeFileSync(filePath, jsonData);

    console.log('Data saved to JSON file successfully.');
  } catch (error) {
    console.error('Error saving data to JSON file:', error);
  }
};


export function generateDistribution(
  totalValue: number,
  minValue: number,
  maxValue: number,
  num: number,
  mode: string,
): number[] {
  if (mode == "even") {
    let element = totalValue / num;
    let array = [];
    for (let i = 0; i < num; i++)
      array.push(element);
    return array
  }

  // Early checks for impossible scenarios
  if (num * minValue > totalValue || num * maxValue < totalValue) {
    throw new Error('Impossible to satisfy the constraints with the given values.');
  }

  // Start with an evenly distributed array
  let distribution: number[] = new Array(num).fill(minValue);
  let currentTotal: number = minValue * num;

  // Randomly add to each to reach totalValue
  // ensuring values stay within minValue and maxValue
  for (let i = 0; currentTotal < totalValue && i < 10000; i++) {
    for (let j = 0; j < num; j++) {
      // Calculate remaining space to ensure constraints are not broken
      const spaceLeft = Math.min(totalValue - currentTotal, maxValue - distribution[j]);
      if (spaceLeft <= 0) continue;

      // Randomly decide how much to add within the space left
      const addValue = Math.floor(Math.random() * (spaceLeft + 1));
      distribution[j] += addValue;
      currentTotal += addValue;

      // Break early if the target is reached
      if (currentTotal === totalValue) break;
    }
  }

  // In cases where distribution cannot reach totalValue due to rounding, adjust the last element
  // This is safe due to the initial constraints check ensuring a solution exists
  if (currentTotal !== totalValue) {
    const difference = totalValue - currentTotal;
    for (let i = distribution.length - 1; i >= 0; i--) {
      const potentialValue = distribution[i];
      if (potentialValue <= maxValue) {
        distribution[i] += difference;
        break;
      }
    }
  }
  for (let i = 0; i < distribution.length; i++)
    distribution[i] = Math.floor(distribution[i])

  return distribution;
}