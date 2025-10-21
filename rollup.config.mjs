import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import typescript from 'rollup-plugin-typescript2';

const isProduction = process.env.NODE_ENV === 'production';
const outputOptions = isProduction ? {} : { sourcemap: true };

export default {
    input: 'src/index.ts',
    output: [
        {
            dir: './dist',
            format: 'cjs',
            ...outputOptions,
        },
        {
            file: './dist/index.es.mjs',
            format: 'es',
            ...outputOptions,
        },
    ],
    external: ['@openai/agents', 'sequelize', 'better-sqlite3'],
    plugins: [
        commonjs(),
        json(),
        typescript({
            clean: true,
            useTsconfigDeclarationDir: true,
            tsconfigOverride: {
                exclude: ['**/*.spec.ts'],
            },
        }),
    ],
};
