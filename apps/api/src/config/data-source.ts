import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USER || 'checkmypro',
  password: process.env.DATABASE_PASSWORD || 'checkmypro_dev_password',
  database: process.env.DATABASE_NAME || 'checkmypro',
  entities: [__dirname + '/../database/entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: false,
});
