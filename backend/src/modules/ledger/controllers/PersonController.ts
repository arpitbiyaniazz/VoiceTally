import { Request, Response, NextFunction } from 'express';
import { PersonModel } from '../models/PersonModel.js';
import { PersonView } from '../views/PersonView.js';
import { ValidationError } from '../../../core/errors/index.js';
import type { AuthenticatedRequest } from '../../../core/types/index.js';

/**
 * Person Controller — thin handlers for contact/counterparty management.
 */
export const PersonController = {
  async createPerson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { name, phone, address, label } = req.body;

      if (!name) {
        throw new ValidationError('Name is required', {
          name: ['Person name cannot be empty'],
        });
      }

      const person = await PersonModel.create(userId, {
        name,
        phone,
        address,
        label,
      });

      res.status(201).json(PersonView.person(person));
    } catch (error) {
      next(error);
    }
  },

  async listPeople(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const people = await PersonModel.list(userId);

      res.status(200).json(PersonView.personList(people));
    } catch (error) {
      next(error);
    }
  },

  async getPerson(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { personId } = req.params;

      const person = await PersonModel.getById(personId, userId);

      res.status(200).json(PersonView.person(person));
    } catch (error) {
      next(error);
    }
  },

  async searchPeople(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const { name } = req.query;

      if (!name) {
        throw new ValidationError('Search name is required', {
          name: ['Query parameter "name" is required'],
        });
      }

      const people = await PersonModel.findByName(userId, name as string);

      res.status(200).json(PersonView.personList(people));
    } catch (error) {
      next(error);
    }
  },
};
