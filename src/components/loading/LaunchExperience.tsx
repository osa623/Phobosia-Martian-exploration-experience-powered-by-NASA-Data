"use client";

import { useCallback, useEffect, useState } from "react";
import { MainMenu } from "@/components/menu/MainMenu";
import { GameViewport } from "@/components/game/GameViewport";
import { areRequiredAssetsReady, beginGameplayInitialization, completeGameplayInitialization, getAssetLoadingSnapshot, prepareRequiredAssets, subscribeToAssetLoading, type AssetLoadingSnapshot } from "@/core/AssetLoading";
import { LoadingScreen } from "./LoadingScreen";

type LaunchView = "loading" | "menu" | "game";

export function LaunchExperience() {
  const [view, setView] = useState<LaunchView>("loading");
  const [gameMode, setGameMode] = useState<"new" | "continue">("new");
  const [gameReady, setGameReady] = useState(false);
  const [snapshot, setSnapshot] = useState<AssetLoadingSnapshot>(getAssetLoadingSnapshot);

  useEffect(() => subscribeToAssetLoading(setSnapshot), []);

  useEffect(() => {
    let mounted = true;
    void prepareRequiredAssets().then(() => {
      if (mounted && areRequiredAssetsReady()) setView("menu");
    });
    return () => { mounted = false; };
  }, []);

  const startGame = useCallback(async (mode: "new" | "continue") => {
    setGameMode(mode);
    setGameReady(false);
    if (areRequiredAssetsReady()) {
      beginGameplayInitialization();
      setView("game");
      return;
    }
    setView("loading");
    await prepareRequiredAssets();
    if (areRequiredAssetsReady()) {
      setGameReady(false);
      beginGameplayInitialization();
      setView("game");
    }
  }, []);

  const retry = useCallback(async () => {
    await prepareRequiredAssets();
    if (areRequiredAssetsReady()) setView("menu");
  }, []);

  const returnToMenu = useCallback(() => {
    completeGameplayInitialization();
    if (areRequiredAssetsReady()) setView("menu");
  }, []);

  const gameInitialized = useCallback(() => {
    completeGameplayInitialization();
    setGameReady(true);
  }, []);

  if (view === "loading") return <LoadingScreen snapshot={snapshot} onRetry={() => { void retry(); }} />;
  if (view === "game") return <>
    <GameViewport key={gameMode} onReturnToMenu={returnToMenu} onReady={gameInitialized} />
    {!gameReady && <LoadingScreen snapshot={snapshot} onRetry={() => { void retry(); }} />}
  </>;
  if (!areRequiredAssetsReady()) return <LoadingScreen snapshot={snapshot} onRetry={() => { void retry(); }} />;
  return <MainMenu onStartGame={mode => { void startGame(mode); }} />;
}
