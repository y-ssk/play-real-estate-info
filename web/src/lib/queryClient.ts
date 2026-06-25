import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";

/**
 * createQueryClient はサーバ状態用の QueryClient を生成する（ADR-0018）。
 *
 * 関数で包むのはテストごとに新しいクライアントを作り、キャッシュ汚染を避けるため
 * （本番は main.tsx で1つ生成して使い回す）。既定の再試行/再フェッチで足り、周辺は薄く保つ。
 * `config` はテストが再試行を止める等の上書きに使う（本番は無指定＝既定）。
 */
export function createQueryClient(config?: QueryClientConfig): QueryClient {
  return new QueryClient(config);
}
