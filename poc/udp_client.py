import socket
import time

def udp_client():
    serverAddressPort = ("127.0.0.1", 20001)
    bufferSize = 1024
    UDPClientSocket = socket.socket(family=socket.AF_INET, type=socket.SOCK_DGRAM)
    
    msgFromClient = "Hello UDP Server"
    bytesToSend = str.encode(msgFromClient)
    
    UDPClientSocket.sendto(bytesToSend, serverAddressPort)
    msgFromServer = UDPClientSocket.recvfrom(bufferSize)
    print(f"Message from Server {msgFromServer[0].decode('utf-8')}")

if __name__ == '__main__':
    udp_client()
