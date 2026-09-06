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

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new ValidationError('Name is required', {
          name: ['Person name cannot be empty'],
        });
      }

      if (name.trim().length > 100) {
        throw new ValidationError('Name too long', {
          name: ['Name cannot exceed 100 characters'],
        });
      }

      if (phone && (typeof phone !== 'string' || phone.trim().length > 25)) {
        throw new ValidationError('Invalid phone number', {
          phone: ['Phone number cannot exceed 25 characters'],
        });
      }

      if (address && (typeof address !== 'string' || address.trim().length > 255)) {
        throw new ValidationError('Address too long', {
          address: ['Address cannot exceed 255 characters'],
        });
      }

      const person = await PersonModel.create(userId, {
        name: name.trim(),
        phone: phone ? phone.trim() : undefined,
        address: address ? address.trim() : undefined,
        label: label ? String(label).trim().slice(0, 50) : undefined,
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
      const personId = req.params.personId as string;

      const person = await PersonModel.getById(personId, userId);

      res.status(200).json(PersonView.person(person));
    } catch (error) {
      next(error);
    }
  },

  async searchPeople(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req as AuthenticatedRequest;
      const name = req.query.name as string | undefined;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new ValidationError('Search name is required', {
          name: ['Query parameter "name" is required and cannot be empty'],
        });
      }

      if (name.trim().length > 100) {
        throw new ValidationError('Search term too long', {
          name: ['Search query cannot exceed 100 characters'],
        });
      }

      const people = await PersonModel.findByName(userId, name.trim());

      res.status(200).json(PersonView.personList(people));
    } catch (error) {
      next(error);
    }
  },
};
