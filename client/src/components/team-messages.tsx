import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  isRead: boolean;
}

interface Conversation {
  id: string;
  participantId: string;
  participantName: string;
  participantRole: "admin" | "manager" | "agent";
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  messages: Message[];
}

//todo: remove mock functionality
const mockConversations: Conversation[] = [
  {
    id: "1",
    participantId: "1",
    participantName: "Priya Sharma",
    participantRole: "agent",
    lastMessage: "The customer confirmed the order",
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 5),
    unreadCount: 2,
    messages: [
      {
        id: "1",
        senderId: "1",
        senderName: "Priya Sharma",
        content: "Hi, I need help with order #1001",
        timestamp: new Date(Date.now() - 1000 * 60 * 30),
        isRead: true,
      },
      {
        id: "2",
        senderId: "me",
        senderName: "You",
        content: "Sure, what's the issue?",
        timestamp: new Date(Date.now() - 1000 * 60 * 28),
        isRead: true,
      },
      {
        id: "3",
        senderId: "1",
        senderName: "Priya Sharma",
        content: "The customer wants to change the delivery address",
        timestamp: new Date(Date.now() - 1000 * 60 * 25),
        isRead: true,
      },
      {
        id: "4",
        senderId: "me",
        senderName: "You",
        content: "You can update it in the order details page",
        timestamp: new Date(Date.now() - 1000 * 60 * 20),
        isRead: true,
      },
      {
        id: "5",
        senderId: "1",
        senderName: "Priya Sharma",
        content: "The customer confirmed the order",
        timestamp: new Date(Date.now() - 1000 * 60 * 5),
        isRead: false,
      },
    ],
  },
  {
    id: "2",
    participantId: "2",
    participantName: "Amit Singh",
    participantRole: "agent",
    lastMessage: "Thanks for the update!",
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 60),
    unreadCount: 0,
    messages: [
      {
        id: "1",
        senderId: "2",
        senderName: "Amit Singh",
        content: "Can you review my pending orders?",
        timestamp: new Date(Date.now() - 1000 * 60 * 90),
        isRead: true,
      },
      {
        id: "2",
        senderId: "me",
        senderName: "You",
        content: "All looks good. You can proceed with shipment.",
        timestamp: new Date(Date.now() - 1000 * 60 * 70),
        isRead: true,
      },
      {
        id: "3",
        senderId: "2",
        senderName: "Amit Singh",
        content: "Thanks for the update!",
        timestamp: new Date(Date.now() - 1000 * 60 * 60),
        isRead: true,
      },
    ],
  },
  {
    id: "3",
    participantId: "3",
    participantName: "Rahul Verma",
    participantRole: "manager",
    lastMessage: "Meeting at 3 PM today",
    lastMessageTime: new Date(Date.now() - 1000 * 60 * 120),
    unreadCount: 1,
    messages: [
      {
        id: "1",
        senderId: "3",
        senderName: "Rahul Verma",
        content: "Meeting at 3 PM today",
        timestamp: new Date(Date.now() - 1000 * 60 * 120),
        isRead: false,
      },
    ],
  },
];

interface TeamMessagesProps {
  userRole: "admin" | "manager" | "agent";
}

export function TeamMessages({ userRole }: TeamMessagesProps) {
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(
    mockConversations[0]
  );
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedConversation) return;

    const newMessage: Message = {
      id: `${Date.now()}`,
      senderId: "me",
      senderName: "You",
      content: messageInput,
      timestamp: new Date(),
      isRead: true,
    };

    // Update conversations state
    setConversations((prevConvs) =>
      prevConvs.map((conv) => {
        if (conv.id === selectedConversation.id) {
          return {
            ...conv,
            messages: [...conv.messages, newMessage],
            lastMessage: messageInput,
            lastMessageTime: new Date(),
          };
        }
        return conv;
      })
    );

    // Update selected conversation
    setSelectedConversation((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: [...prev.messages, newMessage],
        lastMessage: messageInput,
        lastMessageTime: new Date(),
      };
    });

    setMessageInput("");
  };

  const filteredConversations = conversations.filter((conv) =>
    conv.participantName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="grid md:grid-cols-[350px_1fr] gap-6 h-[600px]">
      {/* Conversations List */}
      <Card className="flex flex-col">
        <div className="p-4 border-b space-y-3">
          <h3 className="font-semibold">Messages</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-conversations"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => setSelectedConversation(conversation)}
                className={cn(
                  "w-full p-3 rounded-md text-left hover-elevate active-elevate-2 transition-colors",
                  selectedConversation?.id === conversation.id && "bg-accent"
                )}
                data-testid={`button-conversation-${conversation.id}`}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-xs">
                      {getInitials(conversation.participantName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-sm truncate">
                        {conversation.participantName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(conversation.lastMessageTime, "HH:mm")}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate flex-1">
                        {conversation.lastMessage}
                      </p>
                      {conversation.unreadCount > 0 && (
                        <Badge variant="default" className="h-5 min-w-5 px-1.5 text-xs">
                          {conversation.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Chat Area */}
      {selectedConversation ? (
        <Card className="flex flex-col">
          {/* Chat Header */}
          <div className="p-4 border-b">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="text-xs">
                  {getInitials(selectedConversation.participantName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-semibold">{selectedConversation.participantName}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {selectedConversation.participantRole}
                </p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {selectedConversation.messages.map((message) => {
                const isMe = message.senderId === "me";
                return (
                  <div
                    key={message.id}
                    className={cn("flex", isMe ? "justify-end" : "justify-start")}
                    data-testid={`message-${message.id}`}
                  >
                    <div
                      className={cn(
                        "max-w-[70%] rounded-lg p-3 space-y-1",
                        isMe
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      <p className="text-sm">{message.content}</p>
                      <p
                        className={cn(
                          "text-xs",
                          isMe ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}
                      >
                        {format(message.timestamp, "HH:mm")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Message Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                placeholder="Type a message..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                data-testid="input-message"
              />
              <Button
                size="icon"
                onClick={handleSendMessage}
                disabled={!messageInput.trim()}
                data-testid="button-send-message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="flex items-center justify-center">
          <p className="text-muted-foreground">Select a conversation to start messaging</p>
        </Card>
      )}
    </div>
  );
}
