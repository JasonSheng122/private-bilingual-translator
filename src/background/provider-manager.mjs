import { PAID_PROVIDERS, QUALITY_MODES, normalizePaidProvider } from "../shared/message-types.mjs";
import { getStoredCustomProviderConfig } from "./custom-provider-config.mjs";
import { getStoredApiKey, normalizeApiKey } from "./secret-manager.mjs";
import { translateWithGeminiProvider } from "../providers/gemini-provider.mjs";
import { translateWithGoogleFreeProvider } from "../providers/google-free-provider.mjs";
import { translateWithCustomGeminiProvider } from "../providers/custom-gemini-provider.mjs";
import { translateWithCustomOpenAiProvider } from "../providers/custom-openai-provider.mjs";

export async function translateSegments({ qualityMode, segments, fetchImpl, apiKey, paidProvider, customProviderConfig } = {}) {
  if (qualityMode === QUALITY_MODES.FREE) {
    return translateWithGoogleFreeProvider(segments, { fetchImpl });
  }

  if (qualityMode === QUALITY_MODES.NATURAL || qualityMode === QUALITY_MODES.DEEP) {
    const resolvedPaidProvider = normalizePaidProvider(paidProvider);
    const usesCustomProvider = resolvedPaidProvider === PAID_PROVIDERS.CUSTOM_OPENAI ||
      resolvedPaidProvider === PAID_PROVIDERS.CUSTOM_GEMINI;
    const customConfigResult = usesCustomProvider
      ? (customProviderConfig
        ? { ok: true, configured: true, ...customProviderConfig }
        : await getStoredCustomProviderConfig())
      : null;

    if (usesCustomProvider && !customConfigResult.configured) {
      return {
        ok: false,
        error: {
          code: "missing_custom_provider_config",
          message: "Custom provider Base URL and model are required."
        }
      };
    }

    const resolvedApiKey = normalizeApiKey(apiKey) || await getStoredApiKey(resolvedPaidProvider);

    if (!resolvedApiKey) {
      return {
        ok: false,
        error: {
          code: "missing_api_key",
          message: usesCustomProvider
            ? "Custom provider API Key is required."
            : "Gemini API Key is required."
        }
      };
    }

    if (resolvedPaidProvider === PAID_PROVIDERS.CUSTOM_OPENAI) {
      return translateWithCustomOpenAiProvider(segments, {
        qualityMode,
        apiKey: resolvedApiKey,
        providerConfig: customConfigResult,
        fetchImpl
      });
    }

    if (resolvedPaidProvider === PAID_PROVIDERS.CUSTOM_GEMINI) {
      return translateWithCustomGeminiProvider(segments, {
        qualityMode,
        apiKey: resolvedApiKey,
        providerConfig: customConfigResult,
        fetchImpl
      });
    }

    return translateWithGeminiProvider(segments, {
      qualityMode,
      apiKey: resolvedApiKey,
      fetchImpl
    });
  }

  if (qualityMode !== QUALITY_MODES.FREE) {
    return {
      ok: false,
      error: {
        code: "unsupported_quality_mode",
        message: "The selected quality mode is not supported."
      }
    };
  }
}
