import { getCustomRepository, getRepository } from 'typeorm';

// import AppError from '../errors/AppError';

import Transaction from '../models/Transaction';
import Category from '../models/Category';
import TransactionsRepository from '../repositories/TransactionsRepository';
import AppError from '../errors/AppError';

interface Request {
  title: string;
  value: number;
  type: 'income' | 'outcome';
  category_title: string;
}

class CreateTransactionService {
  public async execute({
    title,
    value,
    type,
    category_title,
  }: Request): Promise<Transaction> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    const balance = await transactionsRepository.getBalance();

    if (type === 'outcome' && balance.total < value) {
      throw new AppError('Balance is not enough to perform given outcome.');
    }

    const transaction = transactionsRepository.create({
      title,
      value,
      type,
    });

    const checkCategoryExists = await categoriesRepository.findOne({
      title: category_title,
    });

    if (checkCategoryExists) {
      transaction.category_id = checkCategoryExists.id;
    } else {
      const category = categoriesRepository.create({ title: category_title });
      await categoriesRepository.save(category);
      transaction.category_id = category.id;
    }

    await transactionsRepository.save(transaction);

    return transaction;
  }
}

export default CreateTransactionService;
