import path from 'path';
import fs from 'fs';
import csvParse from 'csv-parse';
import { getRepository, In } from 'typeorm';
import uploadConfig from '../config/upload';

import Transaction from '../models/Transaction';
import Category from '../models/Category';

interface Request {
  transactionsFilename: string;
}

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

async function readTransactionsFromCSV(
  filePath: string,
): Promise<{ transactions: CSVTransaction[]; categories: string[] }> {
  const transactions: CSVTransaction[] = [];
  const categories: string[] = [];

  const readCSVStream = fs.createReadStream(filePath);

  const parseStream = csvParse({
    from_line: 2,
    ltrim: true,
    rtrim: true,
  });

  const parseCSV = readCSVStream.pipe(parseStream);

  parseCSV.on('data', line => {
    const [title, type, stringValue, category] = line;

    if (!title || !type || !stringValue) return;
    transactions.push({
      title,
      type,
      value: parseFloat(stringValue),
      category,
    });
    categories.push(category);
  });

  await new Promise(resolve => {
    parseCSV.on('end', resolve);
  });

  return {
    transactions,
    categories,
  };
}

class ImportTransactionsService {
  async execute({ transactionsFilename }: Request): Promise<Transaction[]> {
    const transactionsRepository = getRepository(Transaction);
    const categoriesRepository = getRepository(Category);

    const csvFilePath = path.join(uploadConfig.directory, transactionsFilename);

    const { transactions, categories } = await readTransactionsFromCSV(
      csvFilePath,
    );

    const existentCategories = await categoriesRepository.find({
      title: In(categories),
    });

    const existentCategoriesTitles = existentCategories.map(
      category => category.title,
    );

    const categoriesToCreate = categories
      .filter(
        categoryTitle => !existentCategoriesTitles.includes(categoryTitle),
      )
      .filter((value, index, arr) => arr.indexOf(value) === index);

    const newCategories = categoriesRepository.create(
      categoriesToCreate.map(title => ({ title })),
    );
    await categoriesRepository.save(newCategories);

    const allCategories = [...existentCategories, ...newCategories];

    const categoriesMap = allCategories.reduce(
      (acc: { [key: string]: Category }, category) => {
        acc[category.title] = category;
        return acc;
      },
      {},
    );

    const newTranscations = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category_id: categoriesMap[transaction.category].id,
      })),
    );

    await transactionsRepository.save(newTranscations);

    await fs.promises.unlink(csvFilePath);

    return newTranscations;
  }
}

export default ImportTransactionsService;
