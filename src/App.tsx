import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  Wallet,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Loader,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface TransactionData {
  day: string;
  received: number;
  sent: number;
  net: number;
  from?: string;
  to?: string;
}

interface BalanceChartData {
  day: string;
  balance: number;
}

interface Stats {
  address: string;
  totalReceived: string;
  totalSent: string;
  netBalance: string;
  totalTransactions: number;
  receiveCount: number;
  sendCount: number;
  currentBalance: string;
  balanceTenDaysAgo: string;
  netChange: string;
  netChangeLast10Days: string;
  buySharesTotal: string;
  buySharesCount: number;
  activeStreak: number;
  walletCreatedDate: string;
}

export default function App() {
  const [address, setAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [chartData, setChartData] = useState<BalanceChartData[] | null>(null);
  const [txData, setTxData] = useState<TransactionData[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [allTransfers, setAllTransfers] = useState<any[]>([]);
  const [isTableOpen, setIsTableOpen] = useState(false);

  const formatNumber = (num: number) =>
    num.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const formatCompactNumber = (num: number) => {
    if (Math.abs(num) >= 1000000) {
      return (num / 1000000).toFixed(1) + "M";
    }
    if (Math.abs(num) >= 1000) {
      return (num / 1000).toFixed(1) + "K";
    }
    return Math.round(num).toString();
  };

  const HANDLEOPS_ADDRESS = "0x7f136881b236ed9a403da7a7dd632e9d0390eb63";

  const handleOpsTransactions = allTransfers.filter(
    (tx) =>
      (tx.to || "").toLowerCase() === HANDLEOPS_ADDRESS.toLowerCase() ||
      (tx.from || "").toLowerCase() === HANDLEOPS_ADDRESS.toLowerCase()
  );

  const toMs = (ts: any): number => {
    if (ts === undefined || ts === null) return NaN;
    const s = String(ts).trim();
    const n = Number(s);
    if (Number.isNaN(n)) return NaN;
    return s.length <= 10 ? n * 1000 : n;
  };

  const parseValue = (tx: any) => {
    const decimals = parseInt(tx.tokenDecimal || "18", 10) || 18;
    const raw = Number(tx.value ?? 0);
    if (!Number.isFinite(raw)) return 0;
    return raw / Math.pow(10, decimals);
  };

  // groupTransactionsByDay now uses raw transfers (no handleOps filtering) so bar chart shows deposits & withdrawals raw
  const groupTransactionsByDay = (transfers: any[], address: string) => {
    const dayMap: { [key: string]: TransactionData } = {};
    const now = Date.now();
    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;

    transfers.forEach((tx: any) => {
      const txTime = toMs(tx.timeStamp);
      if (Number.isNaN(txTime)) return;
      if (now - txTime > tenDaysMs) return;

      const date = new Date(txTime);
      const dateKey = `${date.getMonth() + 1}/${date.getDate()}`;

      if (!dayMap[dateKey]) {
        dayMap[dateKey] = {
          day: dateKey,
          received: 0,
          sent: 0,
          net: 0,
        };
      }

      const value = parseValue(tx);

      if ((tx.to || "").toLowerCase() === address.toLowerCase()) {
        dayMap[dateKey].received += value;
      } else if ((tx.from || "").toLowerCase() === address.toLowerCase()) {
        dayMap[dateKey].sent += value;
      }
      dayMap[dateKey].net = dayMap[dateKey].received - dayMap[dateKey].sent;
    });

    const result: TransactionData[] = [];
    for (let i = 9; i >= 0; i--) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000);
      const dateKey = `${date.getMonth() + 1}/${date.getDate()}`;
      result.push(
        dayMap[dateKey] || { day: dateKey, received: 0, sent: 0, net: 0 }
      );
    }

    return result;
  };

  // Build a 10-day balance series anchored to currentBalance from raw transfers.
  // Today's point equals currentBalance; prior days reconstructed by subtracting deltas after day end.
  // Balances are clamped to >= 0.
  const generateBalanceChartFromCurrent = (
    rawTransfers: any[],
    userAddress: string,
    currentBalance: number
  ): BalanceChartData[] => {
    const now = Date.now();
    const user = (userAddress || "").toLowerCase();

    const enriched = rawTransfers
      .map((tx: any) => {
        const timeMs = toMs(tx.timeStamp);
        const to = (tx.to || "").toLowerCase();
        const from = (tx.from || "").toLowerCase();
        const value = parseValue(tx);
        const delta = to === user ? value : from === user ? -value : 0;
        return { timeMs, delta };
      })
      .filter((e: any) => !Number.isNaN(e.timeMs))
      .sort((a: any, b: any) => a.timeMs - b.timeMs);

    const deltas = enriched.map((e) => e.delta);
    const times = enriched.map((e) => e.timeMs);

    // Build suffix sums to get sum of deltas after a given time quickly
    const suffixSum: number[] = new Array(deltas.length);
    let s = 0;
    for (let i = deltas.length - 1; i >= 0; i--) {
      s += deltas[i];
      suffixSum[i] = s;
    }

    const sumDeltasAfter = (t: number) => {
      // binary search first index with times[idx] > t
      let lo = 0;
      let hi = times.length - 1;
      let ans = times.length;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (times[mid] > t) {
          ans = mid;
          hi = mid - 1;
        } else {
          lo = mid + 1;
        }
      }
      if (ans >= times.length) return 0;
      return suffixSum[ans] || 0;
    };

    const balances: { day: string; balance: number }[] = [];
    for (let i = 9; i >= 0; i--) {
      const day = new Date(now - i * 24 * 60 * 60 * 1000);
      day.setHours(23, 59, 59, 999);
      const tEnd = day.getTime();
      const dateKey = `${day.getMonth() + 1}/${day.getDate()}`;

      const after = sumDeltasAfter(tEnd);
      let balanceAtEnd = currentBalance - after;
      if (Number.isNaN(balanceAtEnd)) balanceAtEnd = 0;
      balanceAtEnd = Math.max(0, balanceAtEnd);

      balances.push({ day: dateKey, balance: balanceAtEnd });
    }

    return balances;
  };

  const calculateActiveStreak = (transfers: any[]) => {
    if (transfers.length === 0) return 0;

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const activeDays = new Set<string>();
    transfers.forEach((tx: any) => {
      const txTime = toMs(tx.timeStamp);
      if (Number.isNaN(txTime)) return;
      const date = new Date(txTime);
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      activeDays.add(dateKey);
    });

    const sortedDays = Array.from(activeDays).sort().reverse();

    let streak = 0;
    let currentDate = new Date(now);

    for (let i = 0; i < sortedDays.length; i++) {
      const checkDate = new Date(currentDate);
      checkDate.setHours(0, 0, 0, 0);
      const checkKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;

      if (sortedDays.includes(checkKey)) {
        streak++;
        currentDate = new Date(currentDate.getTime() - oneDayMs);
      } else if (i === 0) {
        currentDate = new Date(currentDate.getTime() - oneDayMs);
        const yesterdayKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;
        if (sortedDays.includes(yesterdayKey)) {
          streak++;
          currentDate = new Date(currentDate.getTime() - oneDayMs);
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return streak;
  };

  // processTransactionData now derives currentBalance and balanceTenDaysAgo from raw transfers so chart and stats align
  const processTransactionData = (transfers: any[], userAddress: string) => {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    let balanceTenDaysAgo = 0;
    let receivedLast10Days = 0;
    let sentLast10Days = 0;
    let buySharesTotal = 0;
    let buySharesCount = 0;

    const firstTx = transfers.reduce((earliest: any, tx: any) => {
      if (!earliest || parseInt(tx.timeStamp) < parseInt(earliest.timeStamp)) {
        return tx;
      }
      return earliest;
    }, null);

    const walletCreatedDate = firstTx
      ? new Date(parseInt(firstTx.timeStamp) * 1000).toLocaleDateString()
      : "Unknown";

    const activeStreak = calculateActiveStreak(transfers);

    // Compute balanceTenDaysAgo and last10days totals from raw transfers (no special exclusion).
    transfers.forEach((tx: any) => {
      const txTime = toMs(tx.timeStamp);
      if (Number.isNaN(txTime)) return;
      const value = parseValue(tx);

      const isBuyShares =
        (tx.functionName || "").includes("handleOps") &&
        (tx.to || "").toLowerCase() === HANDLEOPS_ADDRESS.toLowerCase();

      if (isBuyShares) {
        buySharesTotal += value;
        buySharesCount++;
      }

      if ((tx.to || "").toLowerCase() === userAddress.toLowerCase()) {
        if (txTime < tenDaysAgo) {
          balanceTenDaysAgo += value;
        } else {
          receivedLast10Days += value;
        }
      } else if ((tx.from || "").toLowerCase() === userAddress.toLowerCase()) {
        if (txTime < tenDaysAgo) {
          balanceTenDaysAgo -= value;
        } else {
          sentLast10Days += value;
        }
      }
    });

    // Totals from raw transfers (no filtering) so currentBalance matches the token ledger
    const totalReceived = transfers
      .filter(
        (tx: any) => (tx.to || "").toLowerCase() === userAddress.toLowerCase()
      )
      .reduce((sum: number, tx: any) => sum + parseValue(tx), 0);

    const totalSent = transfers
      .filter(
        (tx: any) => (tx.from || "").toLowerCase() === userAddress.toLowerCase()
      )
      .reduce((sum: number, tx: any) => sum + parseValue(tx), 0);

    // currentBalance is totalReceived - totalSent (raw). buySharesTotal still tracked for info.
    const currentBalance = totalReceived - totalSent;
    const netChangeLast10Days = receivedLast10Days - sentLast10Days;

    const dailyTx = groupTransactionsByDay(transfers, userAddress);

    // Generate chart anchored to currentBalance using raw transfers
    const balanceChart = generateBalanceChartFromCurrent(
      transfers,
      userAddress,
      currentBalance
    );

    setTxData(dailyTx);
    setChartData(balanceChart);

    const receiveCount = transfers.filter(
      (tx: any) => (tx.to || "").toLowerCase() === userAddress.toLowerCase()
    ).length;

    const sendCount = transfers.filter(
      (tx: any) => (tx.from || "").toLowerCase() === userAddress.toLowerCase()
    ).length;

    setStats({
      address: `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`,
      totalReceived: totalReceived.toFixed(2),
      totalSent: totalSent.toFixed(2),
      netBalance: currentBalance.toFixed(2),
      totalTransactions: transfers.length,
      receiveCount,
      sendCount,
      currentBalance: currentBalance.toFixed(2),
      balanceTenDaysAgo: balanceTenDaysAgo.toFixed(2),
      netChange: netChangeLast10Days.toFixed(2),
      netChangeLast10Days: netChangeLast10Days.toFixed(2),
      buySharesTotal: buySharesTotal.toFixed(2),
      buySharesCount: buySharesCount,
      activeStreak,
      walletCreatedDate,
    });
  };

  const fetchAddressData = async () => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setError("Please enter a valid ETH address (0x...)");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const BRACKY_CONTRACT = "0x06f71fb90F84b35302d132322A3C90E4477333b0";
      const CHAIN_ID = "8453";

      // Include required Etherscan params (module & action).
      const params = new URLSearchParams({
        module: "account",
        action: "tokentx",
        address,
        contractaddress: BRACKY_CONTRACT,
        chainid: CHAIN_ID,
        startblock: "0",
        endblock: "99999999",
        sort: "asc",
      });

      const resp = await fetch(
        `/.netlify/functions/etherscan-proxy?${params.toString()}`
      );

      if (!resp.ok) {
        const errBody = await resp
          .json()
          .catch(() => ({ message: "Unknown error" }));
        setError(
          `Proxy error: ${errBody.error || errBody.message || resp.statusText}`
        );
        setTxData(null);
        setChartData(null);
        setStats(null);
        setIsLoading(false);
        return;
      }

      const data = await resp.json();

      if (data.status === "0" || data.message === "NOTOK") {
        const errorMsg = data.result || data.message || "Unknown API error";
        setError(`API Error: ${errorMsg}`);
        setTxData(null);
        setChartData(null);
        setStats(null);
        setIsLoading(false);
        return;
      }

      if (
        !data.result ||
        !Array.isArray(data.result) ||
        data.result.length === 0
      ) {
        setError("No $BRACKY transactions found for this address.");
        setTxData(null);
        setChartData(null);
        setStats(null);
        setIsLoading(false);
        return;
      }

      const transfers = data.result.filter(
        (tx: {
          tokenDecimal: any;
          tokenSymbol: any;
          tokenID: any;
          value: string;
        }) =>
          tx.tokenDecimal &&
          tx.tokenSymbol &&
          !tx.tokenID &&
          tx.value &&
          tx.value !== "0"
      );

      setAllTransfers(transfers);

      if (transfers.length === 0) {
        setError("No ERC-20 $BRACKY token transfers found for this address.");
        setTxData(null);
        setChartData(null);
        setStats(null);
        setIsLoading(false);
        return;
      }

      processTransactionData(transfers, address);
    } catch (err) {
      console.error("API Error:", err);
      setError("Failed to fetch data. Check server logs and configuration.");
    } finally {
      setIsLoading(false);
    }
  };

  const sortedHandleOps = [...handleOpsTransactions].sort(
    (a, b) => toMs(b.timeStamp) - toMs(a.timeStamp)
  );

  const handleTrack = () => fetchAddressData();
  const isPositive = stats && parseFloat(stats.netChangeLast10Days) >= 0;

  useEffect(() => {
    if (allTransfers.length > 0 && address) {
      processTransactionData(allTransfers, address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTransfers, address]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100">
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white py-6 shadow-lg">
        <div className="max-w-6xl mx-auto px-4 flex items-center gap-3">
          <Wallet className="w-8 h-8 md:w-10 md:h-10" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">$Bracky Tracker</h1>
            <p className="text-blue-100 text-sm md:text-base mt-1">
              Track your Bracky transactions and balance
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 mb-8 border-2 border-blue-200">
          <label className="block text-gray-700 font-semibold mb-4 text-base md:text-lg">
            Enter ETH Address
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setError("");
              }}
              placeholder="0x..."
              className="flex-1 px-4 py-3 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200 transition font-mono text-black text-base md:text-lg"
              onKeyDown={(e) => e.key === "Enter" && handleTrack()}
            />
            <button
              onClick={handleTrack}
              disabled={isLoading}
              className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 disabled:bg-gray-400 text-white font-semibold px-8 py-3 rounded-lg transition flex items-center justify-center gap-2 text-base md:text-lg"
            >
              {isLoading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                "Track"
              )}
            </button>
          </div>
          {error && (
            <div className="flex items-center gap-2 mt-4 text-red-600 bg-red-50 p-4 rounded-lg border-2 border-red-200 text-sm md:text-base">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {stats && txData && chartData && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-blue-500">
                <p className="text-gray-600 text-xs uppercase mb-1">Address</p>
                <p className="text-blue-600 font-mono font-bold text-md break-all">
                  {stats.address}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-purple-500">
                <p className="text-gray-600 text-xs uppercase mb-1">Total TX</p>
                <p className="text-xl font-bold text-purple-600">
                  {stats.totalTransactions}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-orange-500">
                <p className="text-gray-600 text-xs uppercase mb-1">
                  Active Streak
                </p>
                <p className="text-xl font-bold text-orange-600">
                  {stats.activeStreak}{" "}
                  {stats.activeStreak === 1 ? "day" : "days"}{" "}
                  {stats.activeStreak > 3 && "🔥"}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-teal-500">
                <p className="text-gray-600 text-xs uppercase mb-1">
                  Wallet Created
                </p>
                <p className="text-xl font-bold text-teal-600">
                  {stats.walletCreatedDate}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-indigo-500">
                <p className="text-gray-600 text-xs uppercase mb-1">
                  Balance 10d Ago
                </p>
                <p className="text-xl font-bold text-indigo-600">
                  {formatCompactNumber(parseFloat(stats.balanceTenDaysAgo))}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-yellow-500">
                <p className="text-gray-600 text-xs uppercase mb-1">
                  Current Balance
                </p>
                <p className="text-xl font-bold text-yellow-600">
                  {formatCompactNumber(parseFloat(stats.currentBalance))}
                </p>
              </div>
            </div>

            <div
              className={`rounded-xl shadow-lg p-5 flex flex-col sm:flex-row items-center gap-4 border-2 transition ${
                isPositive
                  ? "bg-green-50 border-green-300"
                  : "bg-red-50 border-red-300"
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                  isPositive ? "bg-green-200" : "bg-red-200"
                }`}
              >
                {isPositive ? (
                  <ArrowUpRight className="w-6 h-6 text-green-600" />
                ) : (
                  <ArrowDownLeft className="w-6 h-6 text-red-600" />
                )}
              </div>
              <div className="text-center sm:text-left flex-1">
                <p className="text-gray-600 text-md">10-Day Net Change</p>
                <p
                  className={`text-2xl sm:text-2xl font-bold ${
                    isPositive ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {formatCompactNumber(
                    parseFloat(stats.netChangeLast10Days)
                  )}{" "}
                  $BRACKY
                </p>
                <p className="text-gray-500 text-md mt-1">
                  {formatCompactNumber(parseFloat(stats.balanceTenDaysAgo))} →{" "}
                  {formatCompactNumber(parseFloat(stats.currentBalance))}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-5 border-2 border-blue-200">
              <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-4">
                Daily Transaction Breakdown
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={txData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                  <XAxis
                    dataKey="day"
                    stroke="#64748b"
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    style={{ fontSize: "13px", fontWeight: 500 }}
                  />
                  <YAxis
                    stroke="#64748b"
                    tickFormatter={formatCompactNumber}
                    style={{ fontSize: "13px", fontWeight: 500 }}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCompactNumber(value)}
                    contentStyle={{ fontSize: "13px" }}
                    labelFormatter={() => ""}
                  />
                  <Bar dataKey="received" fill="#10b981" name="Received" />
                  <Bar dataKey="sent" fill="#ef4444" name="Sent" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-5 border-2 border-blue-200">
              <h2 className="text-base sm:text-lg font-bold text-gray-800 mb-4">
                10-Day Balance Trend
              </h2>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                  <XAxis
                    dataKey="day"
                    stroke="#64748b"
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    style={{ fontSize: "13px", fontWeight: 500 }}
                  />
                  <YAxis
                    stroke="#64748b"
                    tickFormatter={formatCompactNumber}
                    style={{ fontSize: "13px", fontWeight: 500 }}
                  />
                  <Tooltip
                    formatter={(value: number) =>
                      formatCompactNumber(Number(value))
                    }
                    contentStyle={{ fontSize: "13px" }}
                    labelFormatter={() => ""}
                  />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-lg border-2 border-blue-200">
              <button
                onClick={() => setIsTableOpen(!isTableOpen)}
                className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition"
              >
                <h2 className="text-base sm:text-lg font-bold text-gray-800">
                  Deposits and Withdrawals ({handleOpsTransactions.length})
                </h2>
                {isTableOpen ? (
                  <ChevronUp className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                )}
              </button>

              {isTableOpen && (
                <div className="px-5 pb-5">
                  <div className="overflow-x-auto -mx-5 px-5">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="py-2 px-2 text-sm">Amount</th>
                          <th className="py-2 px-2 text-sm">Date</th>
                          <th className="py-2 px-2 text-sm">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedHandleOps.map((tx) => {
                          const value = parseValue(tx);
                          const date = new Date(
                            toMs(tx.timeStamp)
                          ).toLocaleDateString();

                          let type = "";
                          if (
                            (tx.to || "").toLowerCase() ===
                            address.toLowerCase()
                          ) {
                            type = "Deposit";
                          } else if (
                            (tx.from || "").toLowerCase() ===
                            address.toLowerCase()
                          ) {
                            type = "Withdrawal";
                          }

                          return (
                            <tr
                              key={tx.hash}
                              className="border-b border-gray-100"
                            >
                              <td className="py-2 px-2 text-sm">
                                {formatNumber(value)}
                              </td>
                              <td className="py-2 px-2 text-xs text-gray-600">
                                {date}
                              </td>
                              <td className="py-2 px-2 text-sm">
                                <span
                                  className={`${type === "Deposit" ? "text-green-600" : "text-red-600"} font-semibold`}
                                >
                                  {type}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!stats && !isLoading && (
          <div className="text-center py-16">
            <Wallet className="w-12 h-12 text-blue-300 mx-auto mb-4 opacity-50" />
            <p className="text-gray-500 text-lg">
              Enter an ETH address to track $BRACKY ERC-20 transactions
            </p>
          </div>
        )}
      </div>

      <div className="bg-blue-600 text-white text-center py-4 mt-12">
        <p className="text-sm text-blue-100">
          $BRACKY Token Tracker • Base L2 Network
        </p>
      </div>
    </div>
  );
}
